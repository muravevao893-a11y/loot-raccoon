# Loot Raccoon — Telegram Mini App Tapper MVP

**Маскот:** енот, который превращает мусор в сокровища.  
**Игровая валюта:** Loot.  
**Черновой токен:** ROON Jetton on TON.  
**Главное правило:** очки в игре не являются деньгами, токен не обещает доходность.

## Что внутри

- React + TypeScript + Vite frontend.
- Mobile-first neon/glass UI.
- Tap loop: энергия, комбо, пассивный доход, бусты/карточки, квесты.
- Telegram WebApp bootstrap: `ready`, `expand`, haptics, initData access.
- TON Connect UI button and manifest placeholder.
- Express + PostgreSQL backend.
- Server-authoritative tap engine: сервер считает энергию, награды, комбо и пассивный доход.
- Persistent leaderboard: сезонный топ и баланс через PostgreSQL.
- Daily systems: Daily Combo, Daily Cipher, Trash Heist.
- Referrals with delayed validation logic foundation.
- Anti-fraud foundation: rate-limit, tap speed checks, risk score, tap event log.
- Product docs: branding, system design, token notes.

## Запуск frontend

```bash
npm install
npm run dev
```

По умолчанию frontend стучится в `http://localhost:8080`. Если API будет на другом адресе:

```bash
VITE_API_URL=https://api.example.com npm run dev
```

## Запуск backend + PostgreSQL

```bash
cd server
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Backend сам создаст таблицы и засеет игровые карточки/квесты при старте.

Для локального теста без Telegram frontend отправляет:

```text
x-telegram-init-data: dev
```

В production нельзя использовать `dev`; Mini App должен передавать реальный `window.Telegram.WebApp.initData`.

## Основные API

```text
GET  /api/me
POST /api/tap
POST /api/upgrades/buy
POST /api/quests/claim
GET  /api/leaderboard?scope=season
GET  /api/daily-combo
POST /api/daily-combo/claim
POST /api/daily-cipher/claim
POST /api/trash-heist/claim
POST /api/wallet/link
```

## База данных

Схема лежит тут:

```text
server/schema.sql
server/src/schema.ts
```

Ключевые таблицы:

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

## Что заменить перед релизом

1. `public/tonconnect-manifest.json`: поставить реальные URL, icon, terms, privacy.
2. `POST /api/admin/snapshot`: закрыть админ-ключом.
3. CORS: заменить localhost на домен Mini App.
4. Anti-fraud: добавить device/session fingerprint, referral graph analysis, duplicate wallet checks.
5. Analytics: PostHog/Amplitude/свой event pipeline.
6. Payments: Telegram Stars для цифровых товаров, если будут скины/баттл-пасс.
7. Token: выпускать Jetton только после юридической проверки и аудита смарт-контракта.

## Suggested deployment

- Frontend: Vercel, Netlify, Cloudflare Pages.
- Backend: Fly.io, Render, Railway, VPS.
- DB: Supabase Postgres, Neon, Railway Postgres.
- Cache/rate limits: Upstash Redis.
- TON: TON Connect + audited Jetton contract.
