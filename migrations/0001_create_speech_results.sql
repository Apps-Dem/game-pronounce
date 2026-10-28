-- Speech recognition attempts from the pronunciation game.
CREATE TABLE IF NOT EXISTS speech_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_word TEXT NOT NULL,
  target_syllables TEXT NOT NULL,
  transcript TEXT NOT NULL,
  confidence REAL,
  score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0 CHECK (passed IN (0, 1)),
  device_info TEXT NOT NULL DEFAULT '{}',
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_speech_results_created_at
  ON speech_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_speech_results_target_word
  ON speech_results(target_word);
CREATE INDEX IF NOT EXISTS idx_speech_results_passed
  ON speech_results(passed);
