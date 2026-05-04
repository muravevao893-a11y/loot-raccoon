import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { initDb, pool, upsertUser } from './db.js';
import { buyUpgrade, claimDailyCipher, claimDailyCombo, claimQuest, claimTrashHeist, applyTap, getPlayerDto } from './gameEngine.js';
import { dailyQuests, getDailyCipherWord, getDailyCombo, upgrades } from './gameConfig.js';
import { verifyTelegramInitData } from './telegramAuth.js';

const app = express();
const port = Number(process.env.PORT ?? 8080);
const botToken = process.env.BOT_TOKEN ?? '';
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '96kb' }));

type AuthUser = Awaited<ReturnType<typeof upsertUser>>;
const requestWindows = new Map<string, number[]>();

const tapSchema = z.object({
  taps: z.number().int().min(1).max(50),
  clientTime: z.number().optional(),
  sessionId: z.string().max(120).optional(),
});
const buySchema = z.object({ upgradeKey: z.string().min(1).max(64) });
const claimQuestSchema = z.object({ questId: z.string().min(1).max(64) });
const comboSchema = z.object({ selectedCards: z.array(z.string().min(1).max(64)).length(3) });
const cipherSchema = z.object({ code: z.string().min(1).max(32) });
const heistSchema = z.object({ district: z.string().min(1).max(64).optional() });

function ipHash(req: express.Request) {
  const raw = `${req.ip ?? ''}:${req.header('x-forwarded-for') ?? ''}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function rateLimit(key: string, maxPerMinute = 180) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const items = (requestWindows.get(key) ?? []).filter((time) => time >= windowStart);
  items.push(now);
  requestWindows.set(key, items);
  return items.length <= maxPerMinute;
}

async function auth(req: express.Request): Promise<{ ok: true; user: AuthUser } | { ok: false; reason: string }> {
  const initData = String(req.header('x-telegram-init-data') ?? '');
  const startParam = String(req.header('x-start-param') ?? '');
  if (process.env.NODE_ENV !== 'production' && initData === 'dev') {
    const user = await upsertUser({ telegramUserId: 'dev-user', username: 'local_dev', firstName: 'Dev', startParam });
    return { ok: true, user };
  }
  const authResult = verifyTelegramInitData(initData, botToken);
  if (!authResult.ok) return { ok: false, reason: authResult.reason ?? 'Invalid Telegram initData' };
  const user = await upsertUser({
    telegramUserId: authResult.userId,
    username: authResult.username,
    firstName: authResult.firstName,
    startParam,
  });
  return { ok: true, user };
}

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    handler(req, res).catch(next);
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'loot-raccoon-api', db: Boolean(process.env.DATABASE_URL) });
});

app.get('/api/config', (_req, res) => {
  res.json({ upgrades, dailyQuests, today: { comboSize: 3, cipherLength: getDailyCipherWord().length } });
});

app.get('/api/me', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const player = await getPlayerDto(authResult.user);
  res.json({ ok: true, player });
}));

app.post('/api/tap', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  if (!rateLimit(`${authResult.user.telegram_user_id}:tap`)) return void res.status(429).json({ ok: false, reason: 'Too many requests' });

  const body = tapSchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });

  const result = await applyTap({
    user: authResult.user,
    taps: body.data.taps,
    clientTime: body.data.clientTime,
    sessionId: body.data.sessionId,
    ipHash: ipHash(req),
  });
  res.json({ ok: true, ...result });
}));

app.post('/api/upgrades/buy', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const body = buySchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });
  res.json(await buyUpgrade(authResult.user, body.data.upgradeKey));
}));

app.post('/api/quests/claim', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const body = claimQuestSchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });
  res.json(await claimQuest(authResult.user, body.data.questId));
}));

app.get('/api/daily-combo', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  res.json({ ok: true, date: new Date().toISOString().slice(0, 10), size: 3, hint: 'Нужно владеть всеми тремя картами. В проде можно скрывать ответ до решения.', combo: getDailyCombo() });
}));

app.post('/api/daily-combo/claim', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const body = comboSchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });
  res.json(await claimDailyCombo(authResult.user, body.data.selectedCards));
}));

app.post('/api/daily-cipher/claim', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const body = cipherSchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });
  res.json(await claimDailyCipher(authResult.user, body.data.code));
}));

app.post('/api/trash-heist/claim', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const body = heistSchema.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ ok: false, reason: 'Invalid payload' });
  res.json(await claimTrashHeist(authResult.user, body.data.district));
}));

app.get('/api/leaderboard', asyncRoute(async (req, res) => {
  const scope = String(req.query.scope ?? 'season');
  const orderColumn = scope === 'balance' ? 'balance' : 'season_points';
  const rows = await pool.query(
    `SELECT u.username, u.first_name, u.telegram_user_id, u.risk_score, ps.balance, ps.total_earned, ps.season_points,
            RANK() OVER (ORDER BY ps.${orderColumn} DESC) AS rank
     FROM player_state ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.is_banned = FALSE
     ORDER BY ps.${orderColumn} DESC
     LIMIT 100`,
  );
  res.json({
    ok: true,
    scope,
    leaderboard: rows.rows.map((row) => ({
      rank: Number(row.rank),
      username: row.username ?? row.first_name ?? `raccoon_${String(row.telegram_user_id).slice(-4)}`,
      balance: Number(row.balance),
      totalEarned: Number(row.total_earned),
      seasonPoints: Number(row.season_points),
      riskScore: Number(row.risk_score),
    })),
  });
}));

app.post('/api/wallet/link', asyncRoute(async (req, res) => {
  const authResult = await auth(req);
  if (!authResult.ok) return void res.status(401).json(authResult);
  const wallet = z.object({ walletAddress: z.string().min(20).max(120) }).safeParse(req.body);
  if (!wallet.success) return void res.status(400).json({ ok: false, reason: 'Invalid wallet' });
  await pool.query('UPDATE users SET wallet_address = $2 WHERE id = $1', [authResult.user.id, wallet.data.walletAddress]);
  res.json({ ok: true });
}));

app.post('/api/admin/snapshot', asyncRoute(async (_req, res) => {
  // Защити этот роут админ-ключом перед реальным релизом.
  const seasonKey = `season_${new Date().toISOString().slice(0, 7)}`;
  await pool.query(
    `INSERT INTO season_snapshots (season_key, user_id, balance, total_earned, season_points, risk_score)
     SELECT $1, u.id, ps.balance, ps.total_earned, ps.season_points, u.risk_score
     FROM users u JOIN player_state ps ON ps.user_id = u.id
     ON CONFLICT (season_key, user_id) DO UPDATE SET
       balance = EXCLUDED.balance,
       total_earned = EXCLUDED.total_earned,
       season_points = EXCLUDED.season_points,
       risk_score = EXCLUDED.risk_score,
       snapshot_at = now()`,
    [seasonKey],
  );
  res.json({ ok: true, seasonKey });
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ ok: false, reason: error instanceof Error ? error.message : 'Internal error' });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Loot Raccoon API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Cannot start API:', error);
    process.exit(1);
  });
