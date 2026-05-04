export type UpgradeKey =
  | 'claws'
  | 'magnet'
  | 'drone'
  | 'vault'
  | 'crew'
  | 'trash_lab'
  | 'black_market'
  | 'rooftop_radio'
  | 'vault_drill'
  | 'district_map';

export type UpgradeConfig = {
  key: UpgradeKey;
  category: 'gear' | 'crew' | 'market' | 'district';
  title: string;
  description: string;
  emoji: string;
  baseCost: number;
  costMultiplier: number;
  effect: 'tapPower' | 'energyLimit' | 'regen' | 'passive' | 'combo';
  effectValue: number;
};

export const upgrades: UpgradeConfig[] = [
  { key: 'claws', category: 'gear', title: 'Неоновые когти', description: '+1 лут за тап', emoji: '⚡', baseCost: 80, costMultiplier: 1.55, effect: 'tapPower', effectValue: 1 },
  { key: 'magnet', category: 'gear', title: 'Магнит для лута', description: '+120 максимум энергии', emoji: '🧲', baseCost: 180, costMultiplier: 1.72, effect: 'energyLimit', effectValue: 120 },
  { key: 'drone', category: 'gear', title: 'Дрон-разведчик', description: '+0.5 энергии/сек', emoji: '🛸', baseCost: 420, costMultiplier: 1.82, effect: 'regen', effectValue: 0.5 },
  { key: 'vault', category: 'market', title: 'Тихий сейф', description: '+7 пассивного лута/мин', emoji: '🧰', baseCost: 900, costMultiplier: 1.9, effect: 'passive', effectValue: 7 },
  { key: 'crew', category: 'crew', title: 'Енотовая банда', description: '+18 пассивного лута/мин', emoji: '🦝', baseCost: 2200, costMultiplier: 2.05, effect: 'passive', effectValue: 18 },
  { key: 'trash_lab', category: 'district', title: 'Мусорная лаборатория', description: '+3 лута за тап, фирменная механика Trash → Treasure', emoji: '🧪', baseCost: 4800, costMultiplier: 2.12, effect: 'tapPower', effectValue: 3 },
  { key: 'black_market', category: 'market', title: 'Чёрный рынок блестяшек', description: '+45 пассивного лута/мин', emoji: '💎', baseCost: 9500, costMultiplier: 2.18, effect: 'passive', effectValue: 45 },
  { key: 'rooftop_radio', category: 'crew', title: 'Радио на крыше', description: '+2% к комбо-бонусу за уровень', emoji: '📻', baseCost: 16000, costMultiplier: 2.22, effect: 'combo', effectValue: 0.02 },
  { key: 'vault_drill', category: 'gear', title: 'Бесшумный бур', description: '+6 лута за тап', emoji: '🪛', baseCost: 30000, costMultiplier: 2.3, effect: 'tapPower', effectValue: 6 },
  { key: 'district_map', category: 'district', title: 'Карта районов', description: '+120 пассивного лута/мин', emoji: '🗺️', baseCost: 72000, costMultiplier: 2.36, effect: 'passive', effectValue: 120 },
];

export const dailyQuests = [
  { id: 'tap-500', title: 'Сделай 500 тапов', type: 'tap', reward: 450, progressTarget: 500, emoji: '👆' },
  { id: 'buy-2', title: 'Купи 2 апгрейда', type: 'upgrade_purchase', reward: 700, progressTarget: 2, emoji: '🛠️' },
  { id: 'invite-1', title: 'Позови 1 друга', type: 'referral', reward: 1200, progressTarget: 1, emoji: '🤝' },
  { id: 'combo-1', title: 'Собери дневную связку', type: 'daily_combo', reward: 5000, progressTarget: 1, emoji: '🧩' },
  { id: 'cipher-1', title: 'Разгадай шифр банды', type: 'daily_cipher', reward: 1500, progressTarget: 1, emoji: '🔐' },
  { id: 'heist-1', title: 'Сделай один Trash Heist', type: 'heist', reward: 2200, progressTarget: 1, emoji: '🗑️' },
] as const;

export const leagues = [
  { title: 'Крыша гаража', min: 0, icon: '🌒' },
  { title: 'Неоновый двор', min: 1500, icon: '🏙️' },
  { title: 'Рынок артефактов', min: 8500, icon: '💎' },
  { title: 'Банда центра', min: 35000, icon: '👑' },
  { title: 'Король лута', min: 150000, icon: '🦝' },
  { title: 'Мэр мусорной империи', min: 750000, icon: '🏛️' },
];

export const cipherWords = ['ROON', 'LOOT', 'VAULT', 'TRASH', 'CREW', 'SHINY', 'ROOFTOP', 'MASK'];

export function getUpgradeCost(baseCost: number, multiplier: number, level: number) {
  return Math.floor(baseCost * Math.pow(multiplier, level));
}

export function periodKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function deterministicIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function getDailyCombo(date = new Date()) {
  const day = periodKey(date);
  const pool = upgrades.map((item) => item.key);
  const picked: UpgradeKey[] = [];
  let salt = 0;
  while (picked.length < 3) {
    const key = pool[deterministicIndex(`${day}:${salt}:combo`, pool.length)];
    if (!picked.includes(key)) picked.push(key);
    salt += 1;
  }
  return picked;
}

export function getDailyCipherWord(date = new Date()) {
  return cipherWords[deterministicIndex(`${periodKey(date)}:cipher`, cipherWords.length)];
}
