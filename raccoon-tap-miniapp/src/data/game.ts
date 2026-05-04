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

export type Upgrade = {
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

export const upgrades: Upgrade[] = [
  { key: 'claws', category: 'gear', title: 'Неоновые когти', description: '+1 к луту за тап за каждый уровень', emoji: '⚡', baseCost: 80, costMultiplier: 1.55, effect: 'tapPower', effectValue: 1 },
  { key: 'magnet', category: 'gear', title: 'Магнит для лута', description: '+120 к максимуму энергии', emoji: '🧲', baseCost: 180, costMultiplier: 1.72, effect: 'energyLimit', effectValue: 120 },
  { key: 'drone', category: 'gear', title: 'Дрон-разведчик', description: '+0.5 энергия/сек', emoji: '🛸', baseCost: 420, costMultiplier: 1.82, effect: 'regen', effectValue: 0.5 },
  { key: 'vault', category: 'market', title: 'Тихий сейф', description: '+7 пассивного лута в минуту', emoji: '🧰', baseCost: 900, costMultiplier: 1.9, effect: 'passive', effectValue: 7 },
  { key: 'crew', category: 'crew', title: 'Енотовая банда', description: '+18 пассивного лута в минуту', emoji: '🦝', baseCost: 2200, costMultiplier: 2.05, effect: 'passive', effectValue: 18 },
  { key: 'trash_lab', category: 'district', title: 'Мусорная лаборатория', description: '+3 лута за тап. Наша фишка: Trash → Treasure', emoji: '🧪', baseCost: 4800, costMultiplier: 2.12, effect: 'tapPower', effectValue: 3 },
  { key: 'black_market', category: 'market', title: 'Чёрный рынок блестяшек', description: '+45 пассивного лута в минуту', emoji: '💎', baseCost: 9500, costMultiplier: 2.18, effect: 'passive', effectValue: 45 },
  { key: 'rooftop_radio', category: 'crew', title: 'Радио на крыше', description: '+2% к комбо-бонусу за уровень', emoji: '📻', baseCost: 16000, costMultiplier: 2.22, effect: 'combo', effectValue: 0.02 },
  { key: 'vault_drill', category: 'gear', title: 'Бесшумный бур', description: '+6 лута за тап', emoji: '🪛', baseCost: 30000, costMultiplier: 2.3, effect: 'tapPower', effectValue: 6 },
  { key: 'district_map', category: 'district', title: 'Карта районов', description: '+120 пассивного лута в минуту', emoji: '🗺️', baseCost: 72000, costMultiplier: 2.36, effect: 'passive', effectValue: 120 },
];

export const leagues = [
  { title: 'Крыша гаража', min: 0, icon: '🌒' },
  { title: 'Неоновый двор', min: 1500, icon: '🏙️' },
  { title: 'Рынок артефактов', min: 8500, icon: '💎' },
  { title: 'Банда центра', min: 35000, icon: '👑' },
  { title: 'Король лута', min: 150000, icon: '🦝' },
  { title: 'Мэр мусорной империи', min: 750000, icon: '🏛️' },
];

export const dailyQuests = [
  { id: 'tap-500', title: 'Сделай 500 тапов', reward: 450, progressTarget: 500, emoji: '👆' },
  { id: 'buy-2', title: 'Купи 2 апгрейда', reward: 700, progressTarget: 2, emoji: '🛠️' },
  { id: 'invite-1', title: 'Позови 1 друга', reward: 1200, progressTarget: 1, emoji: '🤝' },
  { id: 'combo-1', title: 'Собери дневную связку', reward: 5000, progressTarget: 1, emoji: '🧩' },
  { id: 'cipher-1', title: 'Разгадай шифр банды', reward: 1500, progressTarget: 1, emoji: '🔐' },
  { id: 'heist-1', title: 'Сделай один Trash Heist', reward: 2200, progressTarget: 1, emoji: '🗑️' },
];

export function getUpgradeCost(baseCost: number, multiplier: number, level: number) {
  return Math.floor(baseCost * Math.pow(multiplier, level));
}

export function formatNumber(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.floor(value).toLocaleString('ru-RU');
}

export function getLeague(balance: number) {
  return leagues.reduce((current, league) => (balance >= league.min ? league : current), leagues[0]);
}
