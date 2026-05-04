export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  wallet_address TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  risk_score INTEGER NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_state (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(24, 4) NOT NULL DEFAULT 0,
  total_earned NUMERIC(24, 4) NOT NULL DEFAULT 0,
  season_points NUMERIC(24, 4) NOT NULL DEFAULT 0,
  energy NUMERIC(14, 4) NOT NULL DEFAULT 1000,
  max_energy INTEGER NOT NULL DEFAULT 1000,
  tap_power INTEGER NOT NULL DEFAULT 1,
  regen_per_second NUMERIC(12, 4) NOT NULL DEFAULT 3,
  passive_per_minute NUMERIC(16, 4) NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0,
  combo_bonus NUMERIC(6, 4) NOT NULL DEFAULT 0,
  taps_today INTEGER NOT NULL DEFAULT 0,
  last_tap_at TIMESTAMPTZ,
  last_energy_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upgrade_defs (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  base_cost NUMERIC(20, 4) NOT NULL,
  cost_multiplier NUMERIC(10, 4) NOT NULL,
  effect TEXT NOT NULL,
  effect_value NUMERIC(14, 4) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS player_upgrades (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upgrade_key TEXT NOT NULL REFERENCES upgrade_defs(key),
  level INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, upgrade_key)
);

CREATE TABLE IF NOT EXISTS quest_defs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  target NUMERIC(18, 4) NOT NULL,
  reward NUMERIC(20, 4) NOT NULL,
  period TEXT NOT NULL DEFAULT 'daily',
  emoji TEXT NOT NULL DEFAULT '🎯',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS quest_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL REFERENCES quest_defs(id),
  period_key TEXT NOT NULL,
  progress NUMERIC(18, 4) NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quest_id, period_key)
);

CREATE TABLE IF NOT EXISTS tap_batches (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_taps INTEGER NOT NULL,
  rejected_taps INTEGER NOT NULL,
  earned NUMERIC(24, 4) NOT NULL,
  client_time BIGINT,
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  session_id TEXT,
  risk_delta INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tap_batches_user_time_idx ON tap_batches(user_id, server_time DESC);

CREATE TABLE IF NOT EXISTS referrals (
  inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  PRIMARY KEY (inviter_user_id, invited_user_id)
);

CREATE TABLE IF NOT EXISTS daily_combo_claims (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  combo_date DATE NOT NULL,
  selected_cards TEXT[] NOT NULL,
  reward NUMERIC(20, 4) NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, combo_date)
);

CREATE TABLE IF NOT EXISTS cipher_claims (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cipher_date DATE NOT NULL,
  submitted_code_hash TEXT NOT NULL,
  reward NUMERIC(20, 4) NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cipher_date)
);

CREATE TABLE IF NOT EXISTS heist_claims (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  heist_date DATE NOT NULL,
  district TEXT NOT NULL,
  reward NUMERIC(20, 4) NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, heist_date)
);

CREATE TABLE IF NOT EXISTS season_snapshots (
  id BIGSERIAL PRIMARY KEY,
  season_key TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(24, 4) NOT NULL,
  total_earned NUMERIC(24, 4) NOT NULL,
  season_points NUMERIC(24, 4) NOT NULL,
  risk_score INTEGER NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_key, user_id)
);

CREATE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code);
CREATE INDEX IF NOT EXISTS users_wallet_idx ON users(wallet_address);
CREATE INDEX IF NOT EXISTS leaderboard_balance_idx ON player_state(balance DESC);
CREATE INDEX IF NOT EXISTS leaderboard_season_idx ON player_state(season_points DESC);
`;
