const MAX_HEARTBEAT_SECONDS = 60;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeReadingHeartbeat(input = {}) {
  const id = String(input.id || '').trim();
  const paperId = String(input.paperId || '').trim();
  const sessionId = String(input.sessionId || '').trim();
  const requestedSeconds = Number(input.activeSeconds);

  if (!id || id.length > 160) throw badRequest('Reading session id is required');
  if (!paperId || paperId.length > 200) throw badRequest('Paper id is required');
  if (!sessionId || sessionId.length > 160) throw badRequest('App session id is required');
  if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
    throw badRequest('Active seconds must be positive');
  }

  return {
    id,
    paperId,
    sessionId,
    activeSeconds: Math.min(MAX_HEARTBEAT_SECONDS, Math.max(1, Math.round(requestedSeconds))),
  };
}

export function recordReadingHeartbeat(db, input, now = new Date().toISOString()) {
  const heartbeat = normalizeReadingHeartbeat(input);
  db.run(
    `INSERT INTO reading_sessions
      (id, paper_id, session_id, active_seconds, started_at, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       active_seconds = reading_sessions.active_seconds + excluded.active_seconds,
       ended_at = excluded.ended_at,
       updated_at = excluded.updated_at`,
    [
      heartbeat.id,
      heartbeat.paperId,
      heartbeat.sessionId,
      heartbeat.activeSeconds,
      now,
      now,
      now,
      now,
    ]
  );
  return heartbeat;
}

export function getReadingTimeTotals(db, now = new Date().toISOString()) {
  const result = db.exec(
    `SELECT
       COALESCE(SUM(active_seconds), 0) AS total_seconds,
       COALESCE(SUM(CASE
         WHEN datetime(updated_at) >= datetime(?, '-6 days') THEN active_seconds
         ELSE 0
       END), 0) AS this_week_seconds
     FROM reading_sessions`,
    [now]
  );
  const values = result[0]?.values?.[0] || [0, 0];
  return {
    totalSeconds: Number(values[0] || 0),
    thisWeekSeconds: Number(values[1] || 0),
  };
}

export { MAX_HEARTBEAT_SECONDS };
