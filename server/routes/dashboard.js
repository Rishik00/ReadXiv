import express from 'express';
import { getDB } from '../db.js';
import { getReadingTimeTotals } from '../readingSessions.js';

const router = express.Router();

function rowToObject(row, columns) {
  return Object.fromEntries(columns.map((col, idx) => [col, row[idx]]));
}

function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => rowToObject(row, columns));
}

function firstRow(result) {
  return rowsToObjects(result)[0] || {};
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildDateWindow(days, now = new Date()) {
  const today = startOfLocalDay(now);
  return Array.from({ length: days }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - idx));
    return toIsoDate(date);
  });
}

export function calculateStreaks(readsByDay) {
  let longestStreak = 0;
  let running = 0;
  for (const day of readsByDay) {
    if (day.views > 0) {
      running += 1;
      longestStreak = Math.max(longestStreak, running);
    } else {
      running = 0;
    }
  }

  let currentStreak = 0;
  for (let idx = readsByDay.length - 1; idx >= 0; idx -= 1) {
    if (readsByDay[idx].views <= 0) break;
    currentStreak += 1;
  }

  return { currentStreak, longestStreak };
}

router.get('/summary', async (req, res) => {
  try {
    const db = await getDB();
    const daysRaw = Number.parseInt(req.query.days, 10);
    const days = Number.isFinite(daysRaw) ? Math.max(7, Math.min(daysRaw, 182)) : 30;
    const dates = buildDateWindow(days);
    const sinceDate = dates[0];

    const totals = firstRow(
      db.exec(
        `SELECT
           COUNT(*) AS total_papers,
           SUM(CASE WHEN status = 'reading' THEN 1 ELSE 0 END) AS reading_now,
           SUM(CASE WHEN status = 'writing' THEN 1 ELSE 0 END) AS writing_now,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN date(created_at) >= date('now', '-6 days') THEN 1 ELSE 0 END) AS added_this_week
         FROM papers`
      )
    );

    const activityRows = rowsToObjects(
      db.exec(
        `SELECT
           date(created_at) AS date,
           COUNT(*) AS views,
           COUNT(DISTINCT paper_id) AS distinct_papers
         FROM analytics_events
         WHERE event_name = 'paper_view'
           AND date(created_at) >= date(?)
         GROUP BY date(created_at)
         ORDER BY date(created_at) ASC`,
        [sinceDate]
      )
    );
    const activityByDate = new Map(activityRows.map((row) => [row.date, row]));
    const readsByDay = dates.map((date) => {
      const row = activityByDate.get(date);
      return {
        date,
        views: Number(row?.views || 0),
        distinctPapers: Number(row?.distinct_papers || 0),
      };
    });
    const streaks = calculateStreaks(readsByDay);

    const recentReads = rowsToObjects(
      db.exec(
        `SELECT
           p.id,
           p.title,
           p.authors,
           p.year,
           p.status,
           p.current_page,
           p.total_pages,
           MAX(e.created_at) AS last_accessed_at
         FROM analytics_events e
         JOIN papers p ON p.id = e.paper_id
         WHERE e.event_name = 'paper_view'
           AND e.paper_id IS NOT NULL
         GROUP BY p.id
         ORDER BY last_accessed_at DESC
         LIMIT 8`
      )
    );

    const touchedThisWeek = firstRow(
      db.exec(
        `SELECT COUNT(DISTINCT paper_id) AS count
         FROM analytics_events
         WHERE event_name = 'paper_view'
           AND paper_id IS NOT NULL
           AND date(created_at) >= date('now', '-6 days')`
      )
    );

    const totalActiveDays = firstRow(
      db.exec(
        `SELECT COUNT(DISTINCT date(created_at)) AS count
         FROM analytics_events
         WHERE event_name = 'paper_view'`
      )
    );

    const recentlyAdded = rowsToObjects(
      db.exec(
        `SELECT id, title, authors, year, status, created_at
         FROM papers
         ORDER BY created_at DESC
         LIMIT 6`
      )
    );

    const staleReading = rowsToObjects(
      db.exec(
        `SELECT id, title, authors, year, status, last_accessed_at
         FROM papers
         WHERE status = 'reading'
         ORDER BY COALESCE(last_accessed_at, created_at) ASC
         LIMIT 6`
      )
    );

    const continuePaper = rowsToObjects(
      db.exec(
        `SELECT id, title, authors, year, status, current_page, total_pages, last_accessed_at
         FROM papers
         WHERE status = 'reading' OR COALESCE(current_page, 1) > 1
         ORDER BY COALESCE(last_accessed_at, updated_at, created_at) DESC
         LIMIT 1`
      )
    )[0] || recentReads[0] || null;

    const readingTime = getReadingTimeTotals(db);

    // Paper of the day — deterministic by UTC day, excludes done papers
    const podCountRow = firstRow(db.exec(`SELECT COUNT(*) as c FROM papers WHERE status != 'done'`));
    const podCount = Number(podCountRow.c || 0);
    let paperOfDay = null;
    if (podCount > 0) {
      const todayOffset = Math.floor(Date.now() / 86400000) % podCount;
      const podRows = rowsToObjects(
        db.exec(
          `SELECT id, title, authors, year, abstract FROM papers WHERE status != 'done' ORDER BY created_at ASC LIMIT 1 OFFSET ?`,
          [todayOffset]
        )
      );
      paperOfDay = podRows[0] || null;
    }

    // Age distribution — papers grouped by publication year
    const ageRows = rowsToObjects(
      db.exec(
        `SELECT CAST(year AS INTEGER) AS yr, COUNT(*) AS count
         FROM papers
         WHERE year IS NOT NULL AND year != '' AND CAST(year AS INTEGER) > 1900
         GROUP BY yr
         ORDER BY yr DESC
         LIMIT 15`
      )
    );

    // Unread papers — added but never opened
    const unreadPapers = rowsToObjects(
      db.exec(
        `SELECT p.id, p.title, p.authors, p.year, p.created_at
         FROM papers p
         WHERE NOT EXISTS (
           SELECT 1 FROM analytics_events e
           WHERE e.paper_id = p.id AND e.event_name = 'paper_view'
         )
         ORDER BY p.created_at DESC
         LIMIT 5`
      )
    );

    return res.json({
      totals: {
        totalPapers: Number(totals.total_papers || 0),
        readingNow: Number(totals.reading_now || 0),
        writingNow: Number(totals.writing_now || 0),
        completed: Number(totals.completed || 0),
        addedThisWeek: Number(totals.added_this_week || 0),
        touchedThisWeek: Number(touchedThisWeek.count || 0),
      },
      consistency: {
        days,
        activeDays: readsByDay.filter((day) => day.views > 0).length,
        totalActiveDays: Number(totalActiveDays.count || 0),
        totalViews: readsByDay.reduce((sum, day) => sum + day.views, 0),
        distinctPapers: readsByDay.reduce((sum, day) => sum + day.distinctPapers, 0),
        ...streaks,
        readsByDay,
      },
      readingTime,
      continuePaper,
      recentReads,
      momentum: {
        recentlyAdded,
        staleReading,
      },
      paperOfDay,
      ageDistribution: ageRows,
      unreadPapers,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
