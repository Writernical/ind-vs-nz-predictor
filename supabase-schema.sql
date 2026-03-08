-- =============================================================
-- IND vs NZ T20 WC 2026 Final — Prediction Game
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- 1. Players table
CREATE TABLE IF NOT EXISTS players (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Predictions table (one row per player)
CREATE TABLE IF NOT EXISTS predictions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name TEXT UNIQUE NOT NULL,
  match_winner TEXT,
  top_scorer TEXT,
  player_of_match TEXT,
  total_sixes TEXT,
  first_wicket_over TEXT,
  powerplay_score TEXT,
  highest_individual TEXT,
  over_predictions JSONB DEFAULT '{}'::jsonb,
  score INT DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Match results table (single row updated by admin)
CREATE TABLE IF NOT EXISTS match_results (
  id INT PRIMARY KEY DEFAULT 1,
  match_winner TEXT,
  top_scorer TEXT,
  player_of_match TEXT,
  total_sixes TEXT,
  first_wicket_over TEXT,
  powerplay_score TEXT,
  highest_individual TEXT,
  over_results JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert empty results row
INSERT INTO match_results (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. Live score cache (optional — stores latest score from cricket API)
CREATE TABLE IF NOT EXISTS live_score (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO live_score (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 5. Enable Row Level Security
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_score ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies — allow all reads, allow inserts/updates for anon users
-- (for a fun game, we keep it simple; for production, add auth)

-- Predictions: anyone can read, anyone can insert their own, anyone can update their own
CREATE POLICY "Anyone can read predictions"
  ON predictions FOR SELECT USING (true);

CREATE POLICY "Anyone can insert predictions"
  ON predictions FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update predictions"
  ON predictions FOR UPDATE USING (true);

-- Match results: anyone can read, only updates allowed (admin via API)
CREATE POLICY "Anyone can read results"
  ON match_results FOR SELECT USING (true);

CREATE POLICY "Anyone can update results"
  ON match_results FOR UPDATE USING (true);

-- Live score: anyone can read/update
CREATE POLICY "Anyone can read live score"
  ON live_score FOR SELECT USING (true);

CREATE POLICY "Anyone can update live score"
  ON live_score FOR UPDATE USING (true);

-- 7. Enable Realtime for live leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE match_results;
ALTER PUBLICATION supabase_realtime ADD TABLE live_score;

-- Done! Your database is ready.
