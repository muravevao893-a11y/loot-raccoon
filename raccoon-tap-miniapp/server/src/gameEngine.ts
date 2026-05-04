import { createHash } from 'node:crypto';
import { pool } from './db.js';
import { getDailyCipherWord, getDailyCombo, getUpgradeCost, periodKey, upgrades } from './gameConfig.js';

export type PlayerDto = {
  userId: string;
  username?: string;
  firstName?: string;
  referralCode: string;
  balance: number;
  totalEarned: number;
  seasonPoints: number;
  energy: number;
  maxEnergy: number;
  tapPower: number;
  regenPerSecond: number;
  passivePerMinute: number;
  combo: number;
  comboBonus: number;
  tapsToday: number;
  riskScore: number;
  upgrades: Record<string, number>;
  questProgress: Record<string, number>;
};

type DbUser = {
  id: string;
  telegram_user_id: string;
  username?: string | null;
  first_name?: string | null;
  referral_code: string;
  risk_score: number;
  is_banned: boolean;
};

function n(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function calculateDerived(levels: Record<string, number>) {
  let tapPower = 1;
  let maxEnergy = 1000;
  let regenPerSecond = 3;
  let passivePerMinute = 0;
  let comboBonus = 0;

  for (const upgrade of upgrades) {
    const level = levels[upgrade.key] ?? 0;
    const bonus = level * upgrade.effectValue;
    if (upgrade.effect === 'tapPower') tapPower += bonus;
    if (upgrade.effect === 'energyLimit') maxEnergy += bonus;
    if (upgrade.effect === 'regen') regenPerSecond += bonus;
    if (upgrade.effect === 'passive') passivePerMinute += bonus;
    if (upgrade.effect === 'combo') comboBonus += bonus;
  }

  return { tapPower, maxEnergy, regenPerSecond, passivePerMinute, comboBonus };
}

async function getUpgradeLevels(userId: string) {
  const rows = await pool.query<{ upgrade_key: string; level: number }>(
    'SELECT upgrade_key, level FROM player_upgrades WHERE user_id = $1',
    [userId],
  );
  return Object.fromEntries(rows.rows.map((row) => [row.upgrade_key, row.level]));
}

async function getQuestProgress(userId: string) {
  const day = periodKey();
  const rows = await pool.query<{ quest_id: string; progress: string; claimed_at: string | null }>(
    `SELECT q.id AS quest_id, COALESCE(p.progress, 0) AS progress, p.claimed_at
     FROM quest_defs q
     LEFT JOIN quest_progress p ON p.quest_id = q.id AND p.user_id = $1 AND p.period_key = $2
     WHERE q.active = TRUE`,
    [userId, day],
  );
  return Object.fromEntries(rows.rows.map((row) => [row.quest_id, row.claimed_at ? -999999 : n(row.progress)]));
}

export async function applyRegenAndPassive(user: DbUser) {
  const levels = await getUpgradeLevels(user.id);
  const derived = calculateDerived(levels);
  const result = await pool.query(
    `UPDATE player_state SET
      max_energy = $2,
      tap_power = $3,
      regen_per_second = $4,
      passive_per_minute = $5,
      combo_bonus = $6,
      energy = LEAST($2, energy + EXTRACT(EPOCH FROM (now() - last_energy_at)) * $4),
      balance = balance + LEAST(EXTRACT(EPOCH FROM (now() - last_energy_at)) / 60, 360) * $5,
      total_earned = total_earned + LEAST(EXTRACT(EPOCH FROM (now() - last_energy_at)) / 60, 360) * $5,
      season_points = season_points + LEAST(EXTRACT(EPOCH FROM (now() - last_energy_at)) / 60, 360) * $5,
      last_energy_at = now(),
      updated_at = now()
     WHERE user_id = $1
     RETURNING *`,
    [user.id, derived.maxEnergy, derived.tapPower, derived.regenPerSecond, derived.passivePerMinute, derived.comboBonus],
  );
  return { row: result.rows[0], levels };
}

export async function getPlayerDto(user: DbUser): Promise<PlayerDto> {
  const { row, levels } = await applyRegenAndPassive(user);
  const questProgress = await getQuestProgress(user.id);
  return {
    userId: user.telegram_user_id,
    username: user.username ?? undefined,
    firstName: user.first_name ?? undefined,
    referralCode: user.referral_code,
    balance: n(row.balance),
    totalEarned: n(row.total_earned),
    seasonPoints: n(row.season_points),
    energy: n(row.energy),
    maxEnergy: n(row.max_energy),
    tapPower: n(row.tap_power),
    regenPerSecond: n(row.regen_per_second),
    passivePerMinute: n(row.passive_per_minute),
    combo: n(row.combo),
    comboBonus: n(row.combo_bonus),
    tapsToday: n(row.taps_today),
    riskScore: user.risk_score,
    upgrades: levels,
    questProgress,
  };
}

async function bumpQuest(userId: string, questId: string, amount: number) {
  const day = periodKey();
  await pool.query(
    `INSERT INTO quest_progress (user_id, quest_id, period_key, progress)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, quest_id, period_key) DO UPDATE SET
       progress = LEAST((SELECT target FROM quest_defs WHERE id = $2), quest_progress.progress + $4),
       updated_at = now()
     WHERE quest_progress.claimed_at IS NULL`,
    [userId, questId, day, amount],
  );
}

export async function applyTap(input: {
  user: DbUser;
  taps: number;
  clientTime?: number;
  ipHash?: string;
  sessionId?: string;
}) {
  if (input.user.is_banned) throw new Error('Banned user');
  const { row } = await applyRegenAndPassive(input.user);
  const now = Date.now();
  const lastTap = row.last_tap_at ? new Date(row.last_tap_at).getTime() : 0;
  const msSinceLast = lastTap ? Math.max(1, now - lastTap) : 1000;
  const tapsPerSecond = input.taps / (msSinceLast / 1000);

  let riskDelta = 0;
  if (tapsPerSecond > 18) riskDelta += 2;
  if (input.taps > 25) riskDelta += 3;

  const antiBotCap = input.user.risk_score + riskDelta > 40 ? 1 : input.taps;
  const acceptedTaps = Math.max(0, Math.min(Math.floor(n(row.energy)), input.taps, antiBotCap));
  const rejectedTaps = input.taps - acceptedTaps;
  const nextCombo = msSinceLast <= 1500 ? n(row.combo) + acceptedTaps : acceptedTaps;
  const comboMultiplier = 1 + Math.min(0.75, Math.floor(nextCombo / 25) * (0.05 + n(row.combo_bonus)));
  const earned = Math.floor(acceptedTaps * n(row.tap_power) * comboMultiplier);

  await pool.query('BEGIN');
  try {
    await pool.query(
      `UPDATE player_state SET
        energy = GREATEST(0, energy - $2),
        balance = balance + $3,
        total_earned = total_earned + $3,
        season_points = season_points + $3,
        combo = $4,
        taps_today = taps_today + $2,
        last_tap_at = now(),
        updated_at = now()
       WHERE user_id = $1`,
      [input.user.id, acceptedTaps, earned, nextCombo],
    );
    await pool.query(
      `INSERT INTO tap_batches (user_id, accepted_taps, rejected_taps, earned, client_time, ip_hash, session_id, risk_delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.user.id, acceptedTaps, rejectedTaps, earned, input.clientTime ?? null, input.ipHash ?? null, input.sessionId ?? null, riskDelta],
    );
    if (riskDelta > 0) await pool.query('UPDATE users SET risk_score = risk_score + $2 WHERE id = $1', [input.user.id, riskDelta]);
    if (acceptedTaps > 0) await bumpQuest(input.user.id, 'tap-500', acceptedTaps);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  return { acceptedTaps, rejectedTaps, earned, player: await getPlayerDto(input.user) };
}

export async function buyUpgrade(user: DbUser, upgradeKey: string) {
  const upgrade = upgrades.find((item) => item.key === upgradeKey);
  if (!upgrade) throw new Error('Unknown upgrade');
  await applyRegenAndPassive(user);

  await pool.query('BEGIN');
  try {
    const current = await pool.query<{ level: number }>(
      'SELECT level FROM player_upgrades WHERE user_id = $1 AND upgrade_key = $2 FOR UPDATE',
      [user.id, upgradeKey],
    );
    const level = current.rows[0]?.level ?? 0;
    const cost = getUpgradeCost(upgrade.baseCost, upgrade.costMultiplier, level);
    const balance = await pool.query<{ balance: string }>('SELECT balance FROM player_state WHERE user_id = $1 FOR UPDATE', [user.id]);
    if (n(balance.rows[0]?.balance) < cost) {
      await pool.query('ROLLBACK');
      return { ok: false, reason: 'Not enough loot', cost, player: await getPlayerDto(user) };
    }

    await pool.query('UPDATE player_state SET balance = balance - $2, updated_at = now() WHERE user_id = $1', [user.id, cost]);
    await pool.query(
      `INSERT INTO player_upgrades (user_id, upgrade_key, level)
       VALUES ($1,$2,1)
       ON CONFLICT (user_id, upgrade_key) DO UPDATE SET level = player_upgrades.level + 1, updated_at = now()`,
      [user.id, upgradeKey],
    );
    await bumpQuest(user.id, 'buy-2', 1);
    await pool.query('COMMIT');
    return { ok: true, cost, player: await getPlayerDto(user) };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function claimQuest(user: DbUser, questId: string) {
  const day = periodKey();
  const result = await pool.query<{ target: string; reward: string; progress: string; claimed_at: string | null }>(
    `SELECT q.target, q.reward, COALESCE(p.progress,0) AS progress, p.claimed_at
     FROM quest_defs q
     LEFT JOIN quest_progress p ON p.quest_id = q.id AND p.user_id = $1 AND p.period_key = $2
     WHERE q.id = $3 AND q.active = TRUE`,
    [user.id, day, questId],
  );
  const quest = result.rows[0];
  if (!quest) return { ok: false, reason: 'Unknown quest', player: await getPlayerDto(user) };
  if (quest.claimed_at) return { ok: false, reason: 'Already claimed', player: await getPlayerDto(user) };
  if (n(quest.progress) < n(quest.target)) return { ok: false, reason: 'Quest is not completed yet', player: await getPlayerDto(user) };

  const reward = n(quest.reward);
  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO quest_progress (user_id, quest_id, period_key, progress, claimed_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id, quest_id, period_key) DO UPDATE SET claimed_at = now(), updated_at = now()
       WHERE quest_progress.claimed_at IS NULL`,
      [user.id, questId, day, n(quest.target)],
    );
    await pool.query(
      'UPDATE player_state SET balance = balance + $2, total_earned = total_earned + $2, season_points = season_points + $2 WHERE user_id = $1',
      [user.id, reward],
    );
    await pool.query('COMMIT');
    return { ok: true, reward, player: await getPlayerDto(user) };
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function claimDailyCombo(user: DbUser, selectedCards: string[]) {
  const day = periodKey();
  const combo = getDailyCombo();
  const normalized = [...new Set(selectedCards)].sort();
  const target = [...combo].sort();
  const ok = normalized.length === 3 && normalized.every((key, index) => key === target[index]);
  if (!ok) return { ok: false, reason: 'Wrong combo', required: combo };

  const levels = await getUpgradeLevels(user.id);
  const hasCards = combo.every((key) => (levels[key] ?? 0) >= 1);
  if (!hasCards) return { ok: false, reason: 'You need to own all combo cards first', required: combo };

  const inserted = await pool.query(
    `INSERT INTO daily_combo_claims (user_id, combo_date, selected_cards, reward)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING
     RETURNING reward`,
    [user.id, day, combo, 5000],
  );
  if (inserted.rowCount === 0) return { ok: false, reason: 'Daily combo already claimed', required: combo };
  await pool.query('UPDATE player_state SET balance = balance + 5000, total_earned = total_earned + 5000, season_points = season_points + 5000 WHERE user_id = $1', [user.id]);
  await bumpQuest(user.id, 'combo-1', 1);
  return { ok: true, reward: 5000, required: combo, player: await getPlayerDto(user) };
}

export async function claimDailyCipher(user: DbUser, code: string) {
  const day = periodKey();
  const target = getDailyCipherWord();
  if (code.trim().toUpperCase() !== target) return { ok: false, reason: 'Wrong cipher' };
  const inserted = await pool.query(
    `INSERT INTO cipher_claims (user_id, cipher_date, submitted_code_hash, reward)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING
     RETURNING reward`,
    [user.id, day, hash(code.trim().toUpperCase()), 1500],
  );
  if (inserted.rowCount === 0) return { ok: false, reason: 'Daily cipher already claimed' };
  await pool.query('UPDATE player_state SET balance = balance + 1500, total_earned = total_earned + 1500, season_points = season_points + 1500 WHERE user_id = $1', [user.id]);
  await bumpQuest(user.id, 'cipher-1', 1);
  return { ok: true, reward: 1500, player: await getPlayerDto(user) };
}

export async function claimTrashHeist(user: DbUser, district = 'garage') {
  const day = periodKey();
  const levels = await getUpgradeLevels(user.id);
  const power = Object.values(levels).reduce((sum, level) => sum + level, 0);
  const reward = 800 + Math.min(10000, power * 120);
  const inserted = await pool.query(
    `INSERT INTO heist_claims (user_id, heist_date, district, reward)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT DO NOTHING
     RETURNING reward`,
    [user.id, day, district, reward],
  );
  if (inserted.rowCount === 0) return { ok: false, reason: 'Trash Heist already claimed today' };
  await pool.query('UPDATE player_state SET balance = balance + $2, total_earned = total_earned + $2, season_points = season_points + $2 WHERE user_id = $1', [user.id, reward]);
  await bumpQuest(user.id, 'heist-1', 1);
  return { ok: true, reward, player: await getPlayerDto(user) };
}
