import { TonConnectButton } from '@tonconnect/ui-react';
import { Flame, Gem, Gift, KeyRound, Puzzle, RotateCcw, ShieldCheck, Sparkles, Swords, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { dailyQuests, formatNumber, getUpgradeCost, upgrades, type UpgradeKey } from './data/game';
import { claimDailyCipher, claimDailyCombo, claimTrashHeist, fetchDailyCombo, fetchLeaderboard, type LeaderboardRow } from './lib/api';
import { getTelegramUser, haptic, initTelegram, notify } from './lib/telegram';
import { tokenDraft } from './lib/ton';
import { useGame } from './hooks/useGame';

type Tab = 'tap' | 'boosts' | 'quests' | 'leaderboard' | 'token';

function App() {
  const { state, league, tap, buyUpgrade, claimQuest, reset, refresh } = useGame();
  const [tab, setTab] = useState<Tab>('tap');
  const [tapBursts, setTapBursts] = useState<Array<{ id: number; x: number; y: number; value: number }>>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [comboCards, setComboCards] = useState<string[]>([]);
  const [cipher, setCipher] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const user = getTelegramUser();

  useEffect(() => {
    initTelegram();
  }, []);

  useEffect(() => {
    if (tab !== 'leaderboard') return;
    fetchLeaderboard('season')
      .then((data) => setLeaderboard(data.leaderboard))
      .catch(() => setLeaderboard([]));
  }, [tab, state.seasonPoints]);

  useEffect(() => {
    if (tab !== 'quests') return;
    fetchDailyCombo()
      .then((data) => setComboCards(data.combo))
      .catch(() => setComboCards([]));
  }, [tab]);

  const energyPercent = Math.round((state.energy / state.maxEnergy) * 100);

  const nextMilestone = useMemo(() => {
    if (state.totalEarned < 1500) return 1500;
    if (state.totalEarned < 8500) return 8500;
    if (state.totalEarned < 35000) return 35000;
    if (state.totalEarned < 150000) return 150000;
    if (state.totalEarned < 750000) return 750000;
    return Math.ceil(state.totalEarned / 250000) * 250000 + 250000;
  }, [state.totalEarned]);

  function onTap(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    tap();
    haptic(state.combo > 20 ? 'medium' : 'light');
    const id = Date.now() + Math.random();
    setTapBursts((items) => [...items.slice(-10), { id, x, y, value: state.tapPower }]);
    window.setTimeout(() => setTapBursts((items) => items.filter((item) => item.id !== id)), 700);
  }

  async function purchase(key: UpgradeKey) {
    const ok = await buyUpgrade(key);
    if (ok) notify('success');
    else notify('warning');
  }

  async function claim(id: string) {
    const ok = await claimQuest(id);
    if (ok) notify('success');
    else notify('warning');
  }

  async function onClaimCombo() {
    if (comboCards.length !== 3) return;
    const result = await claimDailyCombo(comboCards);
    setEventMessage(result.ok ? `Связка собрана: +${formatNumber(result.reward ?? 0)} лута` : result.reason ?? 'Не вышло');
    if (result.ok) {
      notify('success');
      refresh();
    } else notify('warning');
  }

  async function onClaimCipher() {
    const result = await claimDailyCipher(cipher);
    setEventMessage(result.ok ? `Шифр принят: +${formatNumber(result.reward ?? 0)} лута` : result.reason ?? 'Не вышло');
    if (result.ok) {
      notify('success');
      setCipher('');
      refresh();
    } else notify('warning');
  }

  async function onHeist() {
    const result = await claimTrashHeist('garage');
    setEventMessage(result.ok ? `Trash Heist: +${formatNumber(result.reward ?? 0)} лута` : result.reason ?? 'Не вышло');
    if (result.ok) {
      notify('success');
      refresh();
    } else notify('warning');
  }

  return (
    <main className="app-shell">
      <section className="hero-card glass">
        <div className="profile-row">
          <div className="avatar-mark">🦝</div>
          <div>
            <p className="eyebrow">Loot Raccoon</p>
            <h1>{user?.first_name ? `Привет, ${user.first_name}` : 'Енот вышел на смену'}</h1>
            <small className={state.online ? 'sync-status online' : 'sync-status'}>{state.online ? 'DB online' : 'offline demo'}{state.syncing ? ' · sync' : ''}</small>
          </div>
          <div className="wallet-slot">
            <TonConnectButton />
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-pill">
            <Sparkles size={17} />
            <span>{formatNumber(state.balance)}</span>
            <small>лут</small>
          </div>
          <div className="stat-pill">
            <Zap size={17} />
            <span>{Math.floor(state.energy)}</span>
            <small>энергия</small>
          </div>
          <div className="stat-pill">
            <Trophy size={17} />
            <span>{league.icon}</span>
            <small>{league.title}</small>
          </div>
        </div>
      </section>

      {tab === 'tap' && (
        <section className="tap-screen">
          <div className="league-card glass">
            <div>
              <p className="eyebrow">Текущая лига</p>
              <h2>{league.icon} {league.title}</h2>
            </div>
            <div className="milestone">
              <span>{formatNumber(state.totalEarned)}</span>
              <small>/ {formatNumber(nextMilestone)}</small>
            </div>
          </div>

          <button className="raccoon-button" onPointerDown={onTap} aria-label="Tap to collect loot">
            <span className="raccoon-glow" />
            <span className="raccoon-face">🦝</span>
            <span className="raccoon-band">TRASH → TREASURE</span>
            {tapBursts.map((burst) => (
              <span key={burst.id} className="tap-burst" style={{ left: burst.x, top: burst.y }}>
                +{formatNumber(burst.value)}
              </span>
            ))}
          </button>

          <div className="combo-row">
            <div className="combo-chip"><Flame size={16} /> Комбо x{Math.max(1, Math.floor(state.combo / 25) + 1)}</div>
            <div className="combo-chip">+{formatNumber(state.tapPower)} / тап</div>
            <div className="combo-chip">+{formatNumber(state.passivePerMinute)} / мин</div>
          </div>

          <div className="energy-card glass">
            <div className="energy-head">
              <span>Энергия</span>
              <span>{energyPercent}%</span>
            </div>
            <div className="energy-track"><span style={{ width: `${energyPercent}%` }} /></div>
          </div>
        </section>
      )}

      {tab === 'boosts' && (
        <section className="panel-list">
          <div className="section-head">
            <p className="eyebrow">Мастерская / Карточки</p>
            <h2>Прокачай енота</h2>
          </div>
          {upgrades.map((upgrade) => {
            const level = state.upgrades[upgrade.key] ?? 0;
            const cost = getUpgradeCost(upgrade.baseCost, upgrade.costMultiplier, level);
            return (
              <article className="upgrade-card glass" key={upgrade.key}>
                <div className="upgrade-icon">{upgrade.emoji}</div>
                <div className="upgrade-copy">
                  <h3>{upgrade.title}</h3>
                  <p>{upgrade.description}</p>
                  <small>{upgrade.category} · уровень {level}</small>
                </div>
                <button className="buy-button" onClick={() => purchase(upgrade.key)} disabled={state.balance < cost}>
                  {formatNumber(cost)}
                </button>
              </article>
            );
          })}
        </section>
      )}

      {tab === 'quests' && (
        <section className="panel-list">
          <div className="section-head">
            <p className="eyebrow">Дневные дела</p>
            <h2>Квесты и события</h2>
          </div>

          <article className="event-card glass">
            <div className="upgrade-icon"><Puzzle size={24} /></div>
            <div className="upgrade-copy">
              <h3>Daily Combo</h3>
              <p>Собери три нужные карточки дня: {comboCards.length ? comboCards.join(' + ') : 'загрузка…'}</p>
            </div>
            <button className="buy-button" onClick={onClaimCombo} disabled={comboCards.length !== 3}>Claim</button>
          </article>

          <article className="event-card glass">
            <div className="upgrade-icon"><KeyRound size={24} /></div>
            <div className="upgrade-copy">
              <h3>Daily Cipher</h3>
              <p>Введи слово дня. В будущем можно сделать ввод азбукой Морзе, как мини-головоломку.</p>
              <input className="cipher-input" value={cipher} onChange={(e) => setCipher(e.target.value)} placeholder="ROON" />
            </div>
            <button className="buy-button" onClick={onClaimCipher} disabled={!cipher.trim()}>Check</button>
          </article>

          <article className="event-card glass">
            <div className="upgrade-icon"><Swords size={24} /></div>
            <div className="upgrade-copy">
              <h3>Trash Heist</h3>
              <p>Наша механика: ежедневный налёт на район. Награда растёт от суммарного уровня карточек.</p>
            </div>
            <button className="buy-button" onClick={onHeist}>Raid</button>
          </article>

          {eventMessage && <p className="event-message">{eventMessage}</p>}

          {dailyQuests.map((quest) => {
            const progress = state.questProgress[quest.id] ?? 0;
            const claimed = progress < 0;
            const capped = Math.max(0, Math.min(progress, quest.progressTarget));
            const ready = capped >= quest.progressTarget && !claimed;
            return (
              <article className="quest-card glass" key={quest.id}>
                <div className="upgrade-icon">{quest.emoji}</div>
                <div className="upgrade-copy">
                  <h3>{quest.title}</h3>
                  <p>Награда: {formatNumber(quest.reward)} лута</p>
                  <div className="mini-track"><span style={{ width: `${(capped / quest.progressTarget) * 100}%` }} /></div>
                  <small>{claimed ? 'Получено' : `${capped}/${quest.progressTarget}`}</small>
                </div>
                <button className="buy-button" onClick={() => claim(quest.id)} disabled={!ready}>
                  {claimed ? 'OK' : 'Забрать'}
                </button>
              </article>
            );
          })}

          <article className="ref-card glass">
            <Gift size={22} />
            <div>
              <h3>Реферальный код</h3>
              <p>{state.referralCode ? `ref_${state.referralCode}` : 'появится после подключения DB'} — награда только после серверной проверки активности друга.</p>
            </div>
          </article>
        </section>
      )}

      {tab === 'leaderboard' && (
        <section className="panel-list">
          <div className="section-head">
            <p className="eyebrow">Season leaderboard</p>
            <h2>Топ енотов</h2>
          </div>
          {leaderboard.length === 0 && <p className="event-message">Пока пусто. Запусти backend + Postgres и сделай пару тапов.</p>}
          {leaderboard.map((row) => (
            <article className="leader-row glass" key={`${row.rank}-${row.username}`}>
              <strong>#{row.rank}</strong>
              <div>
                <h3>{row.username}</h3>
                <small>season: {formatNumber(row.seasonPoints)} · balance: {formatNumber(row.balance)}</small>
              </div>
              <Users size={20} />
            </article>
          ))}
        </section>
      )}

      {tab === 'token' && (
        <section className="panel-list">
          <div className="token-card glass">
            <div className="token-orb"><Gem size={38} /></div>
            <p className="eyebrow">Черновик токена</p>
            <h2>${tokenDraft.ticker} — Roon Jetton</h2>
            <p>Токен не продаётся на старте. Сначала сезон, антифрод, таблица честных игроков и только потом распределение.</p>
            <div className="token-rules">
              <span><ShieldCheck size={16} /> без обещаний доходности</span>
              <span><ShieldCheck size={16} /> очки ≠ деньги</span>
              <span><ShieldCheck size={16} /> награды после проверки</span>
            </div>
          </div>

          <button className="danger-reset" onClick={reset}>
            <RotateCcw size={16} /> Сбросить локальный демо-прогресс
          </button>
        </section>
      )}

      <nav className="bottom-tabs glass" aria-label="Game navigation">
        <button className={tab === 'tap' ? 'active' : ''} onClick={() => setTab('tap')}>Тап</button>
        <button className={tab === 'boosts' ? 'active' : ''} onClick={() => setTab('boosts')}>Бусты</button>
        <button className={tab === 'quests' ? 'active' : ''} onClick={() => setTab('quests')}>Дела</button>
        <button className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}>Топ</button>
        <button className={tab === 'token' ? 'active' : ''} onClick={() => setTab('token')}>ROON</button>
      </nav>
    </main>
  );
}

export default App;
