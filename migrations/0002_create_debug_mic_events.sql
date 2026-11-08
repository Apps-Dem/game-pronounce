-- Opt-in browser microphone diagnostics.
CREATE TABLE IF NOT EXISTS debug_mic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  event TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_debug_mic_events_session_created_at
  ON debug_mic_events(session_id, created_at DESC);
