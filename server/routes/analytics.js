import express from 'express';
import { randomUUID } from 'crypto';
import { getDB, scheduleSaveDB } from '../db.js';
import { recordReadingHeartbeat } from '../readingSessions.js';

const router = express.Router();
const MAX_ANALYTICS_EVENTS = 1000;
const ANALYTICS_PRUNE_INTERVAL = 25;
// Start at the threshold so the first new event after an upgrade prunes a
// previously overgrown telemetry table instead of waiting for 25 more writes.
let eventsSincePrune = ANALYTICS_PRUNE_INTERVAL;
const KNOWN_ROUTES = ['home', 'search', 'dashboard', 'reader', 'settings', 'help'];
const ALLOWED_EVENTS = new Set([
  'paper_view',
  'app_error',
  'api_error',
]);

function rowToObject(row, columns) {
  return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]));
}

function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToObject(row, columns));
}

function safeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(value);
}

function pruneAnalyticsEvents(db) {
  // Remove legacy product-analytics noise before applying the retention cap.
  // Paper views support Home's reading history; errors remain available for
  // debugging. Everything else is unused and was the source of most writes.
  db.run(`DELETE FROM analytics_events WHERE event_name NOT IN ('paper_view', 'app_error', 'api_error')`);
  db.run(
    `DELETE FROM analytics_events
     WHERE id IN (
       SELECT id FROM analytics_events
       ORDER BY created_at DESC
       LIMIT -1 OFFSET ?
     )`,
    [MAX_ANALYTICS_EVENTS]
  );
}

export async function recordAnalyticsEvent({
  eventName,
  route = null,
  paperId = null,
  paperTitle = null,
  sessionId = null,
  metadata = {},
}) {
  if (!ALLOWED_EVENTS.has(eventName)) return null;

  const db = await getDB();
  const id = randomUUID();
  db.run(
    `INSERT INTO analytics_events
      (id, event_name, route, paper_id, paper_title, session_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      eventName,
      route,
      paperId,
      paperTitle,
      sessionId,
      safeMetadata(metadata),
    ]
  );
  eventsSincePrune += 1;
  if (eventsSincePrune >= ANALYTICS_PRUNE_INTERVAL) {
    pruneAnalyticsEvents(db);
    eventsSincePrune = 0;
  }
  scheduleSaveDB();
  return { id };
}

router.post('/events', async (req, res) => {
  try {
    const eventName = String(req.body?.eventName || '').trim();
    if (!ALLOWED_EVENTS.has(eventName)) {
      return res.status(400).json({ error: 'Unsupported analytics event' });
    }

    const result = await recordAnalyticsEvent({
      eventName,
      route: req.body?.route ? String(req.body.route) : null,
      paperId: req.body?.paperId ? String(req.body.paperId) : null,
      paperTitle: req.body?.paperTitle ? String(req.body.paperTitle) : null,
      sessionId: req.body?.sessionId ? String(req.body.sessionId) : null,
      metadata: req.body?.metadata,
    });

    return res.status(201).json({ success: true, id: result.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/reading-session', async (req, res) => {
  try {
    const db = await getDB();
    const heartbeat = recordReadingHeartbeat(db, req.body);
    scheduleSaveDB();
    return res.status(202).json({ success: true, activeSeconds: heartbeat.activeSeconds });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const db = await getDB();
    const routeRows = rowsToObjects(
      db.exec(
        `SELECT route, COUNT(*) AS views, MAX(created_at) AS last_viewed_at
         FROM analytics_events
         WHERE event_name = 'page_view' AND route IS NOT NULL
         GROUP BY route
         ORDER BY views DESC, route ASC`
      )
    );

    const routeMap = new Map(routeRows.map((row) => [row.route, row]));
    const knownRouteRows = KNOWN_ROUTES.map((route) => ({
      route,
      views: Number(routeMap.get(route)?.views || 0),
      last_viewed_at: routeMap.get(route)?.last_viewed_at || null,
    }));
    const extraRouteRows = routeRows
      .filter((row) => !KNOWN_ROUTES.includes(row.route))
      .map((row) => ({
        route: row.route,
        views: Number(row.views || 0),
        last_viewed_at: row.last_viewed_at || null,
      }));
    const routes = [...knownRouteRows, ...extraRouteRows].sort(
      (a, b) => b.views - a.views || a.route.localeCompare(b.route)
    );

    const papers = rowsToObjects(
      db.exec(
        `SELECT
           e.paper_id,
           COALESCE(p.title, e.paper_title, e.paper_id) AS title,
           COUNT(*) AS views,
           MAX(e.created_at) AS last_viewed_at
         FROM analytics_events e
         LEFT JOIN papers p ON p.id = e.paper_id
         WHERE e.event_name = 'paper_view' AND e.paper_id IS NOT NULL
         GROUP BY e.paper_id
         ORDER BY views DESC, last_viewed_at DESC
         LIMIT 25`
      )
    ).map((row) => ({
      paper_id: row.paper_id,
      title: row.title,
      views: Number(row.views || 0),
      last_viewed_at: row.last_viewed_at || null,
    }));

    const totals = rowsToObjects(
      db.exec(
        `SELECT event_name, COUNT(*) AS count
         FROM analytics_events
         GROUP BY event_name`
      )
    ).reduce((acc, row) => {
      acc[row.event_name] = Number(row.count || 0);
      return acc;
    }, {});

    const actions = rowsToObjects(
      db.exec(
        `SELECT
           json_extract(metadata_json, '$.action') AS action,
           route,
           COUNT(*) AS count,
           MAX(created_at) AS last_seen_at
         FROM analytics_events
         WHERE event_name = 'ui_action'
         GROUP BY action, route
         ORDER BY count DESC, last_seen_at DESC
         LIMIT 50`
      )
    ).map((row) => ({
      action: row.action || 'unknown',
      route: row.route || null,
      count: Number(row.count || 0),
      last_seen_at: row.last_seen_at || null,
    }));

    const errors = rowsToObjects(
      db.exec(
        `SELECT
           event_name,
           route,
           paper_id,
           paper_title,
           metadata_json,
           created_at
         FROM analytics_events
         WHERE event_name IN ('app_error', 'api_error')
         ORDER BY created_at DESC
         LIMIT 100`
      )
    );

    return res.json({
      routes,
      mostUsedRoutes: routes.filter((row) => row.views > 0).slice(0, 5),
      leastUsedRoutes: [...routes].sort((a, b) => a.views - b.views || a.route.localeCompare(b.route)).slice(0, 5),
      papers,
      actions,
      errors,
      totals,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/performance', async (req, res) => {
  try {
    const db = await getDB();
    const rows = rowsToObjects(
      db.exec(
        `SELECT
           event_name,
           route,
           paper_id,
           CAST(json_extract(metadata_json, '$.durationMs') AS REAL) AS duration_ms
         FROM analytics_events
         WHERE event_name IN ('page_load', 'paper_load', 'pdf_load', 'api_latency')
           AND json_extract(metadata_json, '$.durationMs') IS NOT NULL`
      )
    );

    const grouped = new Map();
    for (const row of rows) {
      const key = [
        row.event_name || 'unknown',
        row.route || 'none',
        row.event_name === 'api_latency' ? row.paper_id || 'api' : 'all',
      ].join('|');
      if (!grouped.has(key)) {
        grouped.set(key, {
          event_name: row.event_name,
          route: row.route || null,
          target: row.event_name === 'api_latency' ? row.paper_id || 'api' : null,
          durations: [],
        });
      }
      const duration = Number(row.duration_ms);
      if (Number.isFinite(duration)) grouped.get(key).durations.push(duration);
    }

    function percentile(sorted, p) {
      if (sorted.length === 0) return null;
      const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
      return Number(sorted[idx].toFixed(1));
    }

    const metrics = [...grouped.values()]
      .map((group) => {
        const sorted = group.durations.sort((a, b) => a - b);
        return {
          event_name: group.event_name,
          route: group.route,
          target: group.target,
          count: sorted.length,
          p50_ms: percentile(sorted, 50),
          p95_ms: percentile(sorted, 95),
          p99_ms: percentile(sorted, 99),
          max_ms: sorted.length ? Number(sorted[sorted.length - 1].toFixed(1)) : null,
        };
      })
      .sort((a, b) => b.count - a.count || String(a.event_name).localeCompare(String(b.event_name)));

    return res.json({ metrics });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
