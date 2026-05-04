import crypto from 'node:crypto';

export type TelegramAuthResult = {
  ok: true;
  userId: string;
  username?: string;
  firstName?: string;
} | {
  ok: false;
  reason: string;
};

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return { params, hash, dataCheckString };
}

export function verifyTelegramInitData(initData: string, botToken: string): TelegramAuthResult {
  if (!initData) return { ok: false, reason: 'Missing Telegram initData' };
  if (!botToken) return { ok: false, reason: 'Missing BOT_TOKEN' };

  const { params, hash, dataCheckString } = parseInitData(initData);
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const hashBuffer = Buffer.from(hash);
  const calculatedBuffer = Buffer.from(calculated);
  if (!hash || hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
    return { ok: false, reason: 'Bad initData hash' };
  }

  const authDate = Number(params.get('auth_date') ?? '0');
  const maxAgeSeconds = 60 * 60 * 24;
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { ok: false, reason: 'initData expired' };
  }

  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, reason: 'Missing user payload' };

  try {
    const user = JSON.parse(userRaw) as { id?: number; username?: string; first_name?: string };
    if (!user.id) return { ok: false, reason: 'Missing user id' };
    return { ok: true, userId: String(user.id), username: user.username, firstName: user.first_name };
  } catch {
    return { ok: false, reason: 'Invalid user payload' };
  }
}
