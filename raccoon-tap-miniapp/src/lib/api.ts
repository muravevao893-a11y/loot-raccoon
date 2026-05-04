import { getInitData, getStartParam } from './telegram';

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export type RemotePlayer = {
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

export type LeaderboardRow = {
  rank: number;
  username: string;
  balance: number;
  totalEarned: number;
  seasonPoints: number;
  riskScore: number;
};

function headers() {
  const initData = getInitData();
  const startParam = getStartParam();
  return {
    'content-type': 'application/json',
    'x-telegram-init-data': initData || 'dev',
    'x-start-param': startParam || '',
  };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchMe() {
  return api<{ ok: true; player: RemotePlayer }>('/api/me');
}

export function sendTapBatch(taps: number, sessionId: string) {
  return api<{ ok: true; acceptedTaps: number; rejectedTaps: number; earned: number; player: RemotePlayer }>('/api/tap', {
    method: 'POST',
    body: JSON.stringify({ taps, clientTime: Date.now(), sessionId }),
  });
}

export function buyRemoteUpgrade(upgradeKey: string) {
  return api<{ ok: boolean; reason?: string; cost?: number; player: RemotePlayer }>('/api/upgrades/buy', {
    method: 'POST',
    body: JSON.stringify({ upgradeKey }),
  });
}

export function claimRemoteQuest(questId: string) {
  return api<{ ok: boolean; reason?: string; reward?: number; player: RemotePlayer }>('/api/quests/claim', {
    method: 'POST',
    body: JSON.stringify({ questId }),
  });
}

export function fetchLeaderboard(scope: 'season' | 'balance' = 'season') {
  return api<{ ok: true; scope: string; leaderboard: LeaderboardRow[] }>(`/api/leaderboard?scope=${scope}`);
}

export function fetchDailyCombo() {
  return api<{ ok: true; date: string; size: number; hint: string; combo: string[] }>('/api/daily-combo');
}

export function claimDailyCombo(selectedCards: string[]) {
  return api<{ ok: boolean; reason?: string; reward?: number; required?: string[]; player?: RemotePlayer }>('/api/daily-combo/claim', {
    method: 'POST',
    body: JSON.stringify({ selectedCards }),
  });
}

export function claimDailyCipher(code: string) {
  return api<{ ok: boolean; reason?: string; reward?: number; player?: RemotePlayer }>('/api/daily-cipher/claim', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function claimTrashHeist(district = 'garage') {
  return api<{ ok: boolean; reason?: string; reward?: number; player?: RemotePlayer }>('/api/trash-heist/claim', {
    method: 'POST',
    body: JSON.stringify({ district }),
  });
}
