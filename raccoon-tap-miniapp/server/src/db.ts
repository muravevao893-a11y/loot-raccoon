import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { SCHEMA_SQL } from './schema.js';
import { dailyQuests, upgrades } from './gameConfig.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export type DbUser = {
  id: string;
  telegram_user_id: string;
  username?: string | null;
  first_name?: string | null;
  referral_code: string;
  risk_score: number;
  is_banned: boolean;
};

function referralCode() {
  return `roon_${randomBytes(5).toString('hex')}`;
}

export async function initDb() {
  await pool.query(SCHEMA_SQL);

  for (const upgrade of upgrades) {
    await pool.query(
      `INSERT INTO upgrade_defs (key, category, title, description, emoji, base_cost, cost_multiplier, effect, effect_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (key) DO UPDATE SET
        category = EXCLUDED.category,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        emoji = EXCLUDED.emoji,
        base_cost = EXCLUDED.base_cost,
        cost_multiplier = EXCLUDED.cost_multiplier,
        effect = EXCLUDED.effect,
        effect_value = EXCLUDED.effect_value,
        active = TRUE`,
      [upgrade.key, upgrade.category, upgrade.title, upgrade.description, upgrade.emoji, upgrade.baseCost, upgrade.costMultiplier, upgrade.effect, upgrade.effectValue],
    );
  }

  for (const quest of dailyQuests) {
    await pool.query(
      `INSERT INTO quest_defs (id, title, type, target, reward, period, emoji)
       VALUES ($1,$2,$3,$4,$5,'daily',$6)
       ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        target = EXCLUDED.target,
        reward = EXCLUDED.reward,
        emoji = EXCLUDED.emoji,
        active = TRUE`,
      [quest.id, quest.title, quest.type, quest.progressTarget, quest.reward, quest.emoji],
    );
  }
}

export async function upsertUser(input: {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  startParam?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<DbUser>('SELECT * FROM users WHERE telegram_user_id = $1 FOR UPDATE', [input.telegramUserId]);
    let user = existing.rows[0] as DbUser | undefined;

    if (!user) {
      let invitedByUserId: string | null = null;
      if (input.startParam?.startsWith('ref_')) {
        const code = input.startParam.replace(/^ref_/, '');
        const inviter = await client.query<{ id: string }>('SELECT id FROM users WHERE referral_code = $1', [code]);
        invitedByUserId = inviter.rows[0]?.id ?? null;
      }

      const created = await client.query<DbUser>(
        `INSERT INTO users (telegram_user_id, username, first_name, referral_code, invited_by_user_id)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [input.telegramUserId, input.username ?? null, input.firstName ?? null, referralCode(), invitedByUserId],
      );
      user = created.rows[0];
      if (!user) throw new Error('Could not create user');

      await client.query('INSERT INTO player_state (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);

      if (invitedByUserId && invitedByUserId !== user.id) {
        await client.query(
          `INSERT INTO referrals (inviter_user_id, invited_user_id)
           VALUES ($1,$2)
           ON CONFLICT (invited_user_id) DO NOTHING`,
          [invitedByUserId, user.id],
        );
      }
    } else {
      const updated = await client.query<DbUser>(
        `UPDATE users SET username = COALESCE($2, username), first_name = COALESCE($3, first_name), last_seen_at = now()
         WHERE telegram_user_id = $1
         RETURNING *`,
        [input.telegramUserId, input.username ?? null, input.firstName ?? null],
      );
      user = updated.rows[0];
      if (!user) throw new Error('Could not update user');
      await client.query('INSERT INTO player_state (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    }

    if (!user) throw new Error('Could not load user');
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
