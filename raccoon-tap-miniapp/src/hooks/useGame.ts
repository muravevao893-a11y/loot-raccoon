import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buyRemoteUpgrade, claimRemoteQuest, fetchMe, sendTapBatch, type RemotePlayer } from '../lib/api';
import { dailyQuests, getLeague, getUpgradeCost, upgrades, type UpgradeKey } from '../data/game';

type UpgradeLevels = Record<UpgradeKey, number>;
type QuestProgress = Record<string, number>;

export type GameState = {
  balance: number;
  totalEarned: number;
  seasonPoints: number;
  energy: number;
  maxEnergy: number;
  tapPower: number;
  regenPerSecond: number;
  passivePerMinute: number;
  tapsToday: number;
  upgrades: UpgradeLevels;
  questProgress: QuestProgress;
  lastSeenAt: number;
  combo: number;
  comboBonus: number;
  referralCode?: string;
  online: boolean;
  syncing: boolean;
};

const defaultLevels: UpgradeLevels = Object.fromEntries(upgrades.map((upgrade) => [upgrade.key, 0])) as UpgradeLevels;
const defaultQuestProgress: QuestProgress = Object.fromEntries(dailyQuests.map((quest) => [quest.id, 0]));
const sessionId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const initialState: GameState = {
  balance: 0,
  totalEarned: 0,
  seasonPoints: 0,
  energy: 1000,
  maxEnergy: 1000,
  tapPower: 1,
  regenPerSecond: 3,
  passivePerMinute: 0,
  tapsToday: 0,
  upgrades: defaultLevels,
  questProgress: defaultQuestProgress,
  lastSeenAt: Date.now(),
  combo: 0,
  comboBonus: 0,
  online: false,
  syncing: false,
};

function calculateDerived(levels: UpgradeLevels) {
  let tapPower = 1;
  let maxEnergy = 1000;
  let regenPerSecond = 3;
  let passivePerMinute = 0;
  let comboBonus = 0;

  for (const upgrade of upgrades) {
    const level = levels[upgrade.key];
    const bonus = level * upgrade.effectValue;
    if (upgrade.effect === 'tapPower') tapPower += bonus;
    if (upgrade.effect === 'energyLimit') maxEnergy += bonus;
    if (upgrade.effect === 'regen') regenPerSecond += bonus;
    if (upgrade.effect === 'passive') passivePerMinute += bonus;
    if (upgrade.effect === 'combo') comboBonus += bonus;
  }

  return { tapPower, maxEnergy, regenPerSecond, passivePerMinute, comboBonus };
}

function fromRemote(player: RemotePlayer, current?: GameState): GameState {
  const levels = { ...defaultLevels, ...(player.upgrades as Partial<UpgradeLevels>) };
  return {
    ...(current ?? initialState),
    balance: player.balance,
    totalEarned: player.totalEarned,
    seasonPoints: player.seasonPoints,
    energy: player.energy,
    maxEnergy: player.maxEnergy,
    tapPower: player.tapPower,
    regenPerSecond: player.regenPerSecond,
    passivePerMinute: player.passivePerMinute,
    tapsToday: player.tapsToday,
    upgrades: levels,
    questProgress: { ...defaultQuestProgress, ...player.questProgress },
    combo: player.combo,
    comboBonus: player.comboBonus,
    referralCode: player.referralCode,
    lastSeenAt: Date.now(),
    online: true,
    syncing: false,
  };
}

function clampGameState(raw: GameState): GameState {
  const upgradesRaw = { ...defaultLevels, ...(raw.upgrades ?? {}) };
  const derived = calculateDerived(upgradesRaw);
  return {
    ...initialState,
    ...raw,
    upgrades: upgradesRaw,
    questProgress: { ...defaultQuestProgress, ...(raw.questProgress ?? {}) },
    ...derived,
    energy: Math.min(raw.energy ?? initialState.energy, derived.maxEnergy),
  };
}

function loadState(): GameState {
  try {
    const saved = localStorage.getItem('loot-raccoon-state');
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as GameState;
    const clamped = clampGameState(parsed);

    const secondsAway = Math.max(0, (Date.now() - clamped.lastSeenAt) / 1000);
    const recoveredEnergy = Math.min(clamped.maxEnergy, clamped.energy + secondsAway * clamped.regenPerSecond);
    const passiveIncome = Math.min(secondsAway / 60, 360) * clamped.passivePerMinute;

    return {
      ...clamped,
      online: false,
      syncing: false,
      energy: recoveredEnergy,
      balance: clamped.balance + passiveIncome,
      totalEarned: clamped.totalEarned + passiveIncome,
      seasonPoints: clamped.seasonPoints + passiveIncome,
      lastSeenAt: Date.now(),
    };
  } catch {
    return initialState;
  }
}

export function useGame() {
  const [state, setState] = useState<GameState>(() => loadState());
  const comboTimer = useRef<number | null>(null);
  const pendingTaps = useRef(0);
  const flushTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchMe();
      setState((current) => fromRemote(result.player, current));
    } catch {
      setState((current) => ({ ...current, online: false, syncing: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        const nextEnergy = Math.min(current.maxEnergy, current.energy + current.regenPerSecond);
        const nextPassive = current.passivePerMinute / 60;
        return {
          ...current,
          energy: nextEnergy,
          balance: current.balance + nextPassive,
          totalEarned: current.totalEarned + nextPassive,
          seasonPoints: current.seasonPoints + nextPassive,
          lastSeenAt: Date.now(),
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('loot-raccoon-state', JSON.stringify({ ...state, lastSeenAt: Date.now() }));
  }, [state]);

  const flushTaps = useCallback(async () => {
    const taps = pendingTaps.current;
    if (taps <= 0) return;
    pendingTaps.current = 0;
    setState((current) => ({ ...current, syncing: true }));
    try {
      const result = await sendTapBatch(Math.min(taps, 50), sessionId);
      setState((current) => fromRemote(result.player, current));
    } catch {
      setState((current) => ({ ...current, online: false, syncing: false }));
    }
  }, []);

  const tap = useCallback(() => {
    setState((current) => {
      if (current.energy < 1) return current;
      const comboBonus = current.combo >= 25 ? Math.floor(current.tapPower * (0.2 + current.comboBonus)) : 0;
      const earned = current.tapPower + comboBonus;
      return {
        ...current,
        balance: current.balance + earned,
        totalEarned: current.totalEarned + earned,
        seasonPoints: current.seasonPoints + earned,
        energy: Math.max(0, current.energy - 1),
        tapsToday: current.tapsToday + 1,
        combo: current.combo + 1,
        questProgress: {
          ...current.questProgress,
          'tap-500': Math.min(500, (current.questProgress['tap-500'] ?? 0) + 1),
        },
      };
    });

    pendingTaps.current += 1;
    if (flushTimer.current) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(flushTaps, 320);

    if (comboTimer.current) window.clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => {
      setState((current) => ({ ...current, combo: 0 }));
    }, 1400);
  }, [flushTaps]);

  const buyUpgrade = useCallback(async (key: UpgradeKey) => {
    const upgrade = upgrades.find((item) => item.key === key);
    if (!upgrade) return false;

    if (state.online) {
      try {
        const result = await buyRemoteUpgrade(key);
        setState((current) => fromRemote(result.player, current));
        return result.ok;
      } catch {
        setState((current) => ({ ...current, online: false }));
      }
    }

    let purchased = false;
    setState((current) => {
      const level = current.upgrades[key];
      const cost = getUpgradeCost(upgrade.baseCost, upgrade.costMultiplier, level);
      if (current.balance < cost) return current;

      const nextLevels = { ...current.upgrades, [key]: level + 1 };
      const derived = calculateDerived(nextLevels);
      purchased = true;

      return {
        ...current,
        balance: current.balance - cost,
        upgrades: nextLevels,
        ...derived,
        energy: Math.min(current.energy, derived.maxEnergy),
        questProgress: {
          ...current.questProgress,
          'buy-2': Math.min(2, (current.questProgress['buy-2'] ?? 0) + 1),
        },
      };
    });

    return purchased;
  }, [state.online]);

  const claimQuest = useCallback(async (questId: string) => {
    if (state.online) {
      try {
        const result = await claimRemoteQuest(questId);
        setState((current) => fromRemote(result.player, current));
        return result.ok;
      } catch {
        setState((current) => ({ ...current, online: false }));
      }
    }

    const quest = dailyQuests.find((item) => item.id === questId);
    if (!quest) return false;

    let claimed = false;
    setState((current) => {
      const progress = current.questProgress[questId] ?? 0;
      if (progress < quest.progressTarget || progress < 0) return current;
      claimed = true;
      return {
        ...current,
        balance: current.balance + quest.reward,
        totalEarned: current.totalEarned + quest.reward,
        seasonPoints: current.seasonPoints + quest.reward,
        questProgress: { ...current.questProgress, [questId]: -999999 },
      };
    });

    return claimed;
  }, [state.online]);

  const reset = useCallback(() => {
    localStorage.removeItem('loot-raccoon-state');
    setState(initialState);
  }, []);

  const league = useMemo(() => getLeague(state.totalEarned), [state.totalEarned]);

  return {
    state,
    league,
    tap,
    buyUpgrade,
    claimQuest,
    reset,
    refresh,
  };
}
