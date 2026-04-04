# Tradezella Clone — Project Context

## What I'm building
A personal trading journal and analytics platform, similar to Tradezella.
The goal is to automatically capture every trade from MetaTrader 5, store it in Supabase,
compute performance metrics, and display everything on a local Next.js dashboard.

---

## Architecture

### VPS (Kamatera)
- VPS IP: 79.108.225.44
- Runs MetaTrader 5 (MT5)
- Single responsibility: extract raw trade data from MT5 and serve it via API
- No storage, no business logic, no analytics — raw data only
- Stack: Python + FastAPI
- MT5 connection: via the `MetaTrader5` Python library
- Exposes endpoints:
  - `POST /connect` — log into an MT5 account (login, investor password, server)
  - `GET /trades` — open positions and recently closed trades
  - `GET /history` — full historical trade data
  - `GET /account` — current account info
  - `GET /health` — liveness check

### Local Mac (main hub)
- Receives data from the VPS
- Normalizes and validates raw MT5 data
- Runs the analytics engine (P&L, win rate, drawdown, R:R, etc.)
- Hosts the Next.js dashboard
- Pushes clean data to Supabase

### Supabase (cloud storage)
- Postgres database for all trade data
- Supabase Auth for dashboard login (email/password + Google OAuth)
- Supabase Realtime for live trade updates on the dashboard
- Supabase Storage for trade screenshots and journal attachments
- Project URL: https://pketjbzskpifjwsytdsl.supabase.co
- Keys stored in: dashboard/.env.local (never commit this file)
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY

---

## Tech Stack

| Layer | Technology |
|---|---|
| VPS bridge | Python 3.11+, FastAPI, MetaTrader5 lib |
| Mac data receiver | Python with type hints |
| Analytics engine | Python module |
| Dashboard | Next.js 14+ (App Router), TypeScript, Tailwind CSS |
| Database client | @supabase/ssr (SSR-safe), @supabase/supabase-js |
| Charts | Recharts or Tremor |
| Auth | Supabase Auth (email/password + Google OAuth) |

---

## Database Schema (Supabase / Postgres)

### `accounts`
- `id` uuid PK
- `user_id` uuid FK → auth.users (owner of this MT5 account)
- `login` bigint unique (MT5 account number)
- `name` text
- `broker` text (e.g. "FundedNext-Server 2")
- `currency` text
- `balance` numeric
- `equity` numeric
- `leverage` integer
- `created_at` / `updated_at` timestamptz

### `mt5_credentials`
- `id` uuid PK
- `user_id` uuid FK → auth.users (NOT NULL)
- `login` bigint NOT NULL
- `password` text NOT NULL (investor/read-only password only — never master password)
- `server` text NOT NULL (e.g. "FundedNext-Server 2")
- `label` text (user-defined nickname for display)
- `created_at` timestamptz
- UNIQUE(user_id, login)

### `trades`
- `id` uuid PK
- `account_id` uuid FK → accounts
- `position_id` bigint NOT NULL
- `ticket` bigint
- `symbol` text
- `direction` text (buy | sell)
- `lot_size` numeric
- `open_price` / `close_price` numeric
- `sl` / `tp` numeric
- `open_time` / `close_time` timestamptz
- `duration_minutes` integer
- `pnl` numeric (gross)
- `pnl_pips` numeric
- `commission` / `swap` numeric
- `net_pnl` numeric
- `tags` text[]
- `notes` / `setup_type` / `mood` / `mistakes` / `screenshot_url` text
- `created_at` / `updated_at` timestamptz
- UNIQUE(account_id, position_id)

### `sessions` (daily summaries)
- `id` uuid PK
- `account_id` uuid FK
- `date` date
- `total_pnl` numeric
- `trade_count` integer
- `notes` text
- UNIQUE(account_id, date)

### `tags`
- `id` uuid PK
- `name` text unique
- `color` text
- `created_at` timestamptz

---

## User Flow (after Phase 3)

```
/                →  redirect to /accounts (if logged in) or /login (if not)
/login           →  email + password sign in (Supabase Auth)
/register        →  create account (Supabase Auth)
/accounts        →  list all linked MT5 accounts; click one to enter dashboard
                    "Add account" button → /connect
/connect         →  broker picker → MT5 credentials form → saves to mt5_credentials
                    → reconnects VPS → redirects back to /accounts
/overview        →  main dashboard (protected, requires active account cookie)
```

---

## Build Phases

### Phase 1 — MT5 account login + raw data pipe ✅
**Goal:** User enters MT5 account credentials in the dashboard and sees raw trade data flowing in.
- FastAPI on VPS with /connect, /account, /trades, /history, /health
- Next.js connect page → cookie-based session
- Broker adapter pattern (MT5 + cTrader stub)
- NumPy <2 required for MetaTrader5 Python lib
- MT5 quirks: TradeDeal has no sl/tp; history_deals_get needs naive UTC datetimes
- next.config.js not .ts (Next.js 14.2 limitation)

---

### Phase 2 — Supabase schema + storage ✅
**Goal:** Define DB schema and sync normalized trade data into Supabase.
- Migration: 001_initial_schema.sql (accounts, trades, sessions, tags)
- mac/normalizer.py: pairs MT5 IN/OUT deals by position_id into TradeRows
- mac/sync.py: VPS → normalise → Supabase upsert (idempotent, batched 500)
- dashboard/lib/supabase.ts: serverClient() + browserClient()
- dashboard/lib/db.ts: typed queries (getAccountByLogin, getAllTrades, etc.)
- overview page reads closed trades from Supabase + open positions from VPS
- Sync Now button in dashboard (POST /api/sync → runs full sync without terminal)
- Supabase upsert requires ?on_conflict= query param in raw HTTP calls

---

### Phase 3 — User Auth + Multi-Account Management ← current
**Goal:** Personal login system. User registers with email/password, then links one or more MT5 accounts. Each account's credentials are stored in Supabase linked to their user ID.

**Backend (new):**
- Migration 002_auth_accounts.sql:
  - Add `user_id` column to `accounts` table
  - New `mt5_credentials` table (login, password, server, label, user_id)
  - RLS: users can only see/edit their own credentials and accounts
- `POST /api/auth/signout` — clears Supabase session
- `POST /api/select-account` — reads credentials from DB, calls VPS /connect, sets active session cookie
- Update `POST /api/connect` — after VPS connect succeeds, save credentials to DB

**Frontend (new):**
- `middleware.ts` — protect all routes except /login and /register using @supabase/ssr
- `/login` — email + password form using Supabase Auth
- `/register` — signup form
- `/accounts` — lists all user's linked MT5 accounts (from mt5_credentials + accounts tables)
  - Click account → calls /api/select-account → redirects to /overview
  - "Add account" → /connect
- Updated `/connect` — same UI but now saves credentials to DB on success
- Root `/` — redirects to /accounts (logged in) or /login (not logged in)

**Key decisions:**
- Use @supabase/ssr for Next.js 14 App Router (handles cookie-based sessions correctly)
- Active account stored in httpOnly cookie `mt5_account` (same as Phase 1, but no password)
- MT5 investor password stored in mt5_credentials table (RLS: user-only access)
- Google OAuth deferred to Phase 3b — foundation is in place via Supabase Auth

**Test gate:**
- Register new user → login → add MT5 account → see it on /accounts → click it → see /overview

---

### Phase 4 — Analytics engine
**Goal:** Compute Tradezella-style metrics from stored trades.

**Backend:**
- Metrics: win rate, avg R:R, profit factor, max drawdown, expectancy,
  best/worst day, consecutive wins/losses, avg trade duration
- Unit tests for every metric with known dummy data

**Frontend:**
- Overview page: metric cards for win rate, profit factor, avg R:R, expectancy
- Equity curve chart (Recharts line chart, cumulative P&L over time)
- Best/worst day callout cards

**Test gate:** All metrics return mathematically correct values for a dummy dataset
AND metric cards on the dashboard show correct numbers matching backend output

---

### Phase 5 — Live dashboard + filtering
**Goal:** Fully working UI with charts, realtime updates, and trade filtering.

**Backend:**
- Supabase Realtime subscription for new trades
- Polling fallback if Realtime is unavailable

**Frontend:**
- Trades table filtering: by date range, symbol, direction (buy/sell)
- Realtime: new trade appears in the table without page refresh
- Responsive layout (works on 13" MacBook screen)

**Test gate:** Dashboard loads with real trades, equity curve is accurate,
new trade appears without page refresh, date filter works correctly

---

### Phase 6 — Journal, tags & notes
**Goal:** Per-trade journaling, tagging, and screenshot upload.

**Backend:**
- Tag CRUD API (create, list, assign to trade)
- Screenshot upload to Supabase Storage

**Frontend:**
- Tag management UI: create tags with colour picker, assign to trades
- Per-trade journal panel: click a trade → slide-out panel with
  notes, mood selector, setup type, mistakes fields
- Screenshot upload button in the trade panel
- Filter dashboard trades by tag

**Test gate:** Tag a trade, write a note, upload screenshot, filter by tag — all work

---

### Phase 7 — Reports & export
**Goal:** Shareable reports and data export.

**Backend:**
- Weekly/monthly aggregations query
- CSV export endpoint

**Frontend:**
- Reports page: weekly/monthly P&L breakdown
- Heatmaps: performance by time of day, day of week, symbol
- PDF export button
- CSV export button

**Test gate:** Generate monthly report PDF and export a clean CSV with all trades

---

## Coding Conventions

- Always write tests alongside new code — never write code without a corresponding test
- Use TypeScript on the Mac/Next.js side, Python with type hints on the VPS side
- Use async/await throughout — no callbacks
- Environment variables go in `.env.local` (never hardcode keys or URLs)
- Keep VPS code completely separate from Mac code — two different directories

### Comment Requirements (MANDATORY — follow these in every file, every time)

Every file, function, and non-obvious line of code MUST be commented. This is a hard
requirement so the codebase remains readable across long sessions and context reloads.

**File-level JSDoc block** — every `.ts` / `.tsx` file must start with a `/** ... */` block that explains:
  - What this file does and why it exists
  - Key design decisions or constraints (e.g. "use client required because…")
  - Any gotchas, MT5 quirks, or Next.js App Router patterns used
  - The data flow through this file (what comes in, what goes out)

**Function-level JSDoc** — every exported function and every non-trivial private function must have:
  - One-sentence summary of what the function does
  - `@param` descriptions for any parameters that aren't obvious from the type
  - Explanation of the return value if it's not obvious
  - Any important side effects (e.g. "sets an httpOnly cookie")
  - Error behaviour (e.g. "returns null on error, never throws")

**Inline comments** — add a comment above (or at the end of) any line that:
  - Does something non-obvious (e.g. `if (month === 0) { setMonth(11); setYear(y => y - 1); }`)
  - Involves a framework quirk (e.g. Next.js cache, Supabase upsert on_conflict)
  - Involves an MT5-specific behaviour (e.g. ENTRY_IN / ENTRY_OUT deal pairing)
  - Has a non-obvious value (e.g. a magic number like `60_000` → explain it's milliseconds)
  - Is doing something for security reasons (e.g. `httpOnly: true`)

**What NOT to comment:**
  - `import` statements (self-explanatory)
  - Simple getters/setters where the variable name is the comment (`const color = "red"`)
  - JSX structure — Tailwind class names don't need comments unless the layout is tricky

**Comment tone:**
  - Write for a developer who understands TypeScript/React but not this specific project
  - Explain the WHY, not the WHAT. `// green for profit` is worse than `// positive P&L days are green, negative are red`
  - Use complete sentences ending with a period for multi-word comments
  - Keep inline comments short — if it needs a paragraph, move it to the function JSDoc

---

## Safety Rules (always follow these)

- Always ask before running any destructive command (delete, drop table, overwrite)
- Never commit `.env` files or any file containing API keys
- Always back up Supabase data before running schema migrations
- Test on dummy/paper trading data before pointing at a live account
- The VPS should NEVER write to Supabase — only the Mac does
- Never store real MT5 master passwords — only investor (read-only) passwords

---

## Project Structure

```
tradezella-clone/
├── CLAUDE_1.md
├── vps/                          ← VPS FastAPI bridge (Kamatera)
│   ├── main.py
│   ├── mt5_client.py
│   └── requirements.txt
├── mac/                          ← Mac-side sync + normalizer
│   ├── normalizer.py
│   ├── sync.py
│   ├── requirements.txt
│   └── tests/
├── dashboard/                    ← Next.js app
│   ├── middleware.ts              ← route protection (Supabase Auth)
│   ├── app/
│   │   ├── page.tsx              ← redirect to /accounts or /login
│   │   ├── login/page.tsx        ← email/password sign in
│   │   ├── register/page.tsx     ← create account
│   │   ├── accounts/page.tsx     ← linked MT5 accounts picker
│   │   ├── connect/page.tsx      ← add new MT5 account
│   │   ├── overview/page.tsx     ← main dashboard
│   │   └── api/
│   │       ├── connect/          ← VPS connect + save credentials
│   │       ├── sync/             ← MT5 → Supabase sync
│   │       ├── select-account/   ← activate an account from /accounts
│   │       └── auth/signout/     ← clear session
│   ├── components/
│   │   └── SyncButton.tsx
│   ├── lib/
│   │   ├── supabase.ts           ← SSR-aware Supabase clients
│   │   ├── db.ts                 ← typed DB queries
│   │   ├── vps.ts                ← VPS API wrapper
│   │   ├── broker.ts             ← broker types + adapter interface
│   │   ├── normalizer.ts         ← TypeScript deal normalizer
│   │   └── adapters/
│   ├── package.json
│   └── .env.local
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql
        └── 002_auth_accounts.sql
```
