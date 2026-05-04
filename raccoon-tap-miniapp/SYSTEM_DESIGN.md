# System Design

## Product direction

Loot Raccoon берёт жанровые механики Telegram tapper-игр, но не делает копию. У нас своя ассоциация: **Trash → Treasure**. Игрок не “CEO биржи”, а енот, который строит мусорную империю, собирает блестяшки, открывает районы и участвует в налётах.

## MVP architecture

```text
Telegram Bot
  ↓ opens
Telegram Mini App frontend
  ↓ x-telegram-init-data
Express API
  ↓
Game Engine
  ↓
PostgreSQL: users, state, upgrades, quests, referrals, events, leaderboard
  ↓
Anti-fraud + analytics
  ↓
Season snapshot
  ↓
Optional TON Jetton allocation
```

## Implemented gameplay systems

### 1. Tap loop

- Player taps raccoon.
- Frontend shows instant optimistic animation.
- Backend receives batched taps.
- Backend validates energy, tap speed, combo and risk.
- Backend returns authoritative state.

### 2. Energy system

- Energy decreases per accepted tap.
- Energy regenerates server-side based on `regen_per_second`.
- Max energy is derived from upgrades.

### 3. Upgrade/card system

Cards are grouped by category:

- `gear`
- `crew`
- `market`
- `district`

Each card has:

- base cost
- cost multiplier
- effect type
- effect value
- player level

### 4. Passive income

Offline/passive income is calculated server-side and capped to 6 hours per sync. This prevents infinite farming after long absence.

### 5. Daily Combo

Daily Combo picks 3 upgrade cards deterministically per day. Claim requires owning all three cards. In production, the answer can be hidden or revealed via community/social loop.

### 6. Daily Cipher

Daily Cipher accepts a daily word. The next UI step is Morse input: short tap = dot, long press = dash.

### 7. Trash Heist

Our own mechanic. Once per day, a player can raid a district. Reward scales with total card levels. Later this can become clan PvE/PvP.

### 8. Quests

Daily quest progress is stored in `quest_progress` by `period_key`. Claims are one-time per period.

### 9. Referrals

Referrals are created from `start_param=ref_CODE`. Rewards should only validate after invited users reach real activity thresholds.

### 10. Leaderboard

Leaderboard reads from PostgreSQL:

- season points
- balance
- total earned
- risk score

Suspicious or banned users can be excluded.

## Database tables

See `server/schema.sql`.

Core tables:

- `users`
- `player_state`
- `upgrade_defs`
- `player_upgrades`
- `quest_defs`
- `quest_progress`
- `tap_batches`
- `referrals`
- `daily_combo_claims`
- `cipher_claims`
- `heist_claims`
- `season_snapshots`

## Server-authoritative rules

Do not trust frontend balances. Frontend is only for animation and UX.

Server calculates:

- accepted taps
- rejected taps
- energy
- passive income
- combo multiplier
- upgrade purchase validity
- quest completion
- referral validity
- leaderboard rank
- airdrop eligibility

## Anti-fraud baseline

Implemented foundation:

- max request rate per user
- max taps per batch
- tap speed risk score
- tap event log
- IP hash field
- session id field

Next layer:

- Redis sliding windows
- device fingerprint
- duplicate wallet detection
- many accounts on same IP/device
- impossible 24h activity
- referral ring detection
- suspicious account quarantine

## Token economy draft

Token: ROON  
Standard: TON Jetton  
Role: community/game utility, not investment.

Suggested allocation draft:

- 45% seasonal player rewards after anti-fraud
- 20% ecosystem quests and partnerships
- 15% treasury
- 10% liquidity/market making, if legally cleared
- 7% team with vesting
- 3% community contests

Do not launch public sale without legal review.
