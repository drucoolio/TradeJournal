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

### Phase 6 — Trade Journal System (Full Analytical Journal)
**Goal:** A comprehensive 3-level journal system (per-trade, daily, weekly) with playbooks, tags, mistake tracking, rules engine, and media uploads. This is the core differentiator of the product.

---

#### 6A — Per-Trade Journal

Every trade gets a detailed journal entry. When a user clicks a trade, a slide-out panel (or full page) opens with these sections:

**Pre-Trade Plan (filled before or after the trade):**
- Setup type — selected from the user's Playbook Library (e.g. "breakout", "pullback", "reversal", "range fade")
- Trade thesis / reasoning — free text explaining why they entered
- Entry criteria checklist — customizable per strategy (e.g. "✓ Higher timeframe trend aligned", "✓ Key level identified")
- Planned R:R ratio — what was the intended risk:reward before entry
- Confidence level — 1 to 5 scale (how confident was this setup?)

**Execution Data (auto-filled from MT5 sync — already exists):**
- Entry price, exit price, SL, TP, lot size, duration, gross P&L, commission, swap, net P&L, pips

**Post-Trade Review (filled after the trade closes):**
- What went right — free text
- What went wrong — free text
- Execution rating — 1 to 5 scale (did I follow my plan?)
- Setup quality rating — 1 to 5 scale (A+, A, B, C, D setup in hindsight)
- Mistakes — multi-select from the Mistake Library (e.g. "moved stop loss", "oversized position", "FOMO entry", "early exit", "didn't take profit", "revenge trade", "traded against trend")
- Lessons learned — free text

**Psychology & Emotions:**
- Mood at entry — emoji/icon selector: calm, anxious, excited, revenge, FOMO, bored, confident, frustrated, greedy, patient
- Mood at exit — same selector
- Emotional notes — free text for anything about mental state

**Media & Screenshots:**
- Chart screenshots — upload multiple images (entry chart, exit chart, higher timeframe context)
- Stored in Supabase Storage, linked to the trade via URLs
- Future: annotation tools on screenshots

**Tags:**
- Assign tags from the Tag System (see 6E below)
- Auto-tags generated from trade data: symbol, direction (long/short), win/loss, session (Asian/London/NY)

**Database changes for per-trade journal:**
- Expand `trades` table with new columns:
  - `trade_thesis` text — pre-trade reasoning
  - `planned_rr` numeric — intended risk:reward
  - `confidence` integer (1–5) — pre-trade confidence
  - `execution_rating` integer (1–5) — did I follow my plan?
  - `setup_rating` integer (1–5) — quality of setup in hindsight
  - `went_right` text — post-trade: what worked
  - `went_wrong` text — post-trade: what didn't work
  - `lessons` text — key takeaways
  - `mood_entry` text — emotional state at entry
  - `mood_exit` text — emotional state at exit
  - `emotion_notes` text — additional emotional notes
  - `playbook_id` uuid FK → playbooks — which strategy was used
  - `mistake_ids` uuid[] — array of mistake IDs from the mistake library
  - `screenshot_urls` text[] — array of Supabase Storage URLs (replaces single screenshot_url)
- Existing columns already in schema: `tags`, `notes`, `setup_type`, `mood`, `mistakes`, `screenshot_url`
  - `setup_type` will be replaced by `playbook_id` (FK to playbooks table)
  - `mood` will be replaced by `mood_entry` + `mood_exit` (more granular)
  - `mistakes` (text) will be replaced by `mistake_ids` (uuid[] FK to mistake library)
  - `screenshot_url` (single) will be replaced by `screenshot_urls` (array)

---

#### 6B — Daily Session Journal

One entry per trading day. Combines auto-calculated stats with manual reflection.

**Auto-Calculated (from existing sessions table + trades):**
- Total P&L for the day
- Number of trades
- Win rate for the day
- Best and worst trade of the day
- Total commissions + swap

**Manual Reflection Fields:**
- Market conditions — select: trending, ranging, volatile, choppy, mixed, news-driven
- What went well today — free text
- What didn't go well today — free text
- Rules followed / rules broken — checklist from the Rules Engine (see 6G)
- Key takeaways — free text
- Goals for tomorrow — free text
- Overall day rating — 1 to 5 scale
- Emotional state tracking — morning / midday / end-of-day mood selectors

**Database changes for daily journal:**
- Expand `sessions` table with new columns:
  - `market_conditions` text — overall market assessment
  - `went_well` text — daily reflection positive
  - `went_poorly` text — daily reflection negative
  - `takeaways` text — key lessons
  - `goals_tomorrow` text — next day goals
  - `day_rating` integer (1–5) — overall rating
  - `mood_morning` text — emotional state at start of day
  - `mood_midday` text — emotional state midday
  - `mood_close` text — emotional state at end of day
  - `rules_followed` uuid[] — which rules were followed (FK to rules table)
  - `rules_broken` uuid[] — which rules were broken (FK to rules table)

---

#### 6C — Weekly Review Journal

One entry per trading week. Higher-level reflection and goal tracking.

**Auto-Calculated:**
- Weekly P&L, total trades, win rate
- Best and worst trade of the week
- Comparison to previous week (P&L delta, win rate delta)
- Most traded symbols and their P&L
- Average hold time for the week
- Average R:R achieved

**Manual Reflection Fields:**
- Goals from last week — were they met? (checkbox review of previous week's goals)
- Top 3 lessons from this week — free text
- Patterns I noticed — free text
- Strategy adjustments for next week — free text
- Goals for next week — free text (these carry forward to next week's review)
- Confidence level heading into next week — 1 to 5 scale
- Overall week rating — 1 to 5 scale

**Database: new `weekly_reviews` table:**
- `id` uuid PK
- `user_id` uuid FK → auth.users
- `account_id` uuid FK → accounts (nullable — can be cross-account)
- `week_start` date — Monday of the reviewed week
- `week_end` date — Sunday of the reviewed week
- `goals_met` jsonb — array of { goal: string, met: boolean }
- `top_lessons` text — top 3 lessons
- `patterns` text — patterns noticed
- `strategy_adjustments` text — changes for next week
- `goals_next_week` text — goals to carry forward
- `confidence` integer (1–5) — heading into next week
- `week_rating` integer (1–5) — overall week rating
- `created_at` / `updated_at` timestamptz
- UNIQUE(user_id, account_id, week_start)

---

#### 6D — Playbook / Strategy Library

Users define their trading setups. Each trade can be linked to a playbook entry for tracking strategy performance.

**Playbook entry fields:**
- Name (e.g. "Bull Flag Breakout", "Supply Zone Rejection")
- Description — detailed explanation of the setup
- Entry rules — bulleted list of conditions that must be met
- Exit rules — when to take profit or cut the trade
- Ideal market conditions — when this setup works best
- Timeframes — which timeframes this applies to
- Risk parameters — default position size, R:R target
- Example screenshots — reference chart images

**Analytics powered by playbook linking:**
- Win rate per strategy
- Average P&L per strategy
- Average R:R per strategy
- Best/worst performing strategy over time
- Number of trades per strategy

**Database: new `playbooks` table:**
- `id` uuid PK
- `user_id` uuid FK → auth.users
- `name` text NOT NULL
- `description` text
- `entry_rules` text
- `exit_rules` text
- `ideal_conditions` text
- `timeframes` text[]
- `default_rr` numeric
- `example_screenshots` text[] — Supabase Storage URLs
- `is_active` boolean default true — soft delete
- `created_at` / `updated_at` timestamptz
- UNIQUE(user_id, name)

---

#### 6E — Tag System

User-defined tags with categories and colors for organizing and filtering trades.

**Tag features:**
- Custom tags with a name, color, and category
- Categories: Strategy, Emotion, Market Condition, Mistake, Custom
- Assign multiple tags to any trade
- Filter trades by tag on the dashboard and journal pages
- Tag analytics: P&L per tag, win rate per tag, frequency per tag

**Database: expand existing `tags` table:**
- Add `user_id` uuid FK → auth.users
- Add `category` text — one of: strategy, emotion, market_condition, mistake, custom
- Change UNIQUE from (name) to (user_id, name) — per-user tags
- Keep existing `color` text field

---

#### 6F — Mistake Library

Pre-defined + custom mistake categories for consistent post-trade analysis.

**Default mistakes (seeded for new users):**
- Moved stop loss
- Oversized position
- FOMO entry
- Revenge trade
- Traded against trend
- Early exit
- Didn't take profit at target
- Entered too late
- No stop loss
- Broke max daily loss rule
- Traded during news
- Overtraded

**Mistake tracking analytics:**
- Frequency of each mistake over time
- "Top 3 mistakes this month" summary
- P&L impact per mistake type (how much did each mistake cost?)
- Mistake trend chart — are you making fewer mistakes over time?

**Database: new `mistakes` table:**
- `id` uuid PK
- `user_id` uuid FK → auth.users
- `name` text NOT NULL
- `description` text — explanation of the mistake
- `is_default` boolean — true for seeded mistakes, false for custom
- `created_at` timestamptz
- UNIQUE(user_id, name)

---

#### 6G — Rules Engine

Users define their personal trading rules. Daily journal includes a checklist for rule adherence.

**Rule examples:**
- "Max 3 trades per day"
- "No trading before major news events"
- "Always use a stop loss"
- "Don't trade in the first 15 minutes of session open"
- "Maximum 2% risk per trade"
- "No trading when emotional"

**Rule tracking:**
- Daily checklist in the Daily Session Journal — mark each rule as followed or broken
- Rule adherence score: percentage of rules followed over time
- Trend chart: are you following your rules more consistently over time?
- "Most broken rule" analytics

**Database: new `rules` table:**
- `id` uuid PK
- `user_id` uuid FK → auth.users
- `name` text NOT NULL — the rule statement
- `description` text — additional context
- `is_active` boolean default true — only active rules appear in the daily checklist
- `created_at` timestamptz
- UNIQUE(user_id, name)

---

#### 6H — Manual Trade Entry

Users can add trades manually — for brokers not connected via API, paper trades, or trades from other platforms.

**Use cases:**
- User trades on a broker that doesn't have API sync (e.g. cTrader, TradingView paper)
- User wants to log a trade from a prop firm challenge on a different platform
- User wants to backtest and log hypothetical trades for review
- Triggered from the "Manual upload" option in the account three-dot menu, or from a global "+ Add Trade" button

**Manual trade form fields:**
- Account — select which account to attach the trade to (or create a "Manual" account)
- Symbol — text input with autocomplete from previously traded symbols
- Direction — buy or sell toggle
- Lot size — numeric input
- Open price — numeric input
- Close price — numeric input
- SL / TP — optional numeric inputs
- Open time — date + time picker
- Close time — date + time picker
- Commission — optional numeric (default 0)
- Swap — optional numeric (default 0)
- Notes — optional free text

**Auto-calculated on save:**
- `duration_minutes` — computed from open_time and close_time
- `pnl` — computed from open_price, close_price, lot_size, direction
- `pnl_pips` — computed from price difference and symbol pip size
- `net_pnl` — pnl + commission + swap
- `position_id` — auto-generated unique ID (negative numbers or UUID-based to distinguish from MT5 synced trades)

**Key rules:**
- Manual trades are flagged with `source = 'manual'` so they can be distinguished from synced trades
- Manual trades are NOT overwritten during MT5 sync (sync uses `onConflict: account_id, position_id` — manual trades have unique position IDs that don't collide with MT5)
- Manual trades can be edited after creation (synced trades cannot have their execution data edited)
- Manual trades can be deleted (synced trades can only be cleared in bulk via "Clear trades")

**Database changes:**
- Add `source` column to `trades` table: `text DEFAULT 'sync'` — values: `'sync'` (from MT5) or `'manual'` (user-entered)
- Manual trades get a generated `position_id` using a sequence or negative number range to avoid collision with MT5 position IDs

**API:**
- `POST /api/trades/manual` — create a manual trade (validates all fields, computes derived values, inserts into trades table)
- `PUT /api/trades/manual/:id` — edit a manual trade (only allowed for source='manual')
- `DELETE /api/trades/manual/:id` — delete a manual trade (only allowed for source='manual')

**UI:**
- Modal or full-page form accessible from:
  - Account row three-dot menu → "Manual upload"
  - Global "+ Add Trade" button on the trades/journal page
- Form has smart defaults (today's date, last used symbol)
- Live P&L preview as user fills in prices
- After save, trade appears in the trades table and journal like any other trade

---

#### 6I — Journal UI Components

**Trade Journal Slide-Out Panel:**
- Clicking any trade in the trades table opens a slide-out panel from the right
- Tabs: Overview (auto-filled data) | Pre-Trade | Post-Trade | Psychology | Media
- Save button persists journal entries to the database
- Navigation: prev/next trade arrows at the top

**Daily Journal Page (`/journal/daily`):**
- Calendar view showing which days have journal entries (green dot)
- Click a date → opens that day's journal with auto-stats at top + reflection form below
- Quick-fill from trades: the journal pre-populates trade stats automatically

**Weekly Review Page (`/journal/weekly`):**
- Week selector (prev/next week arrows)
- Auto-calculated stats panel at top
- Review form below with goals tracking from previous week
- "Start Review" button if no entry exists for the selected week

**Playbook Library Page (`/settings/playbooks`):**
- Card-based grid of all playbooks
- Click to edit, create new, archive
- Each card shows: name, win rate, trade count, avg P&L

**Tags Management Page (`/settings/tags`):**
- Already in SettingsSidebar as "Tags management"
- List all tags with color picker, category selector, rename, delete
- Usage count per tag

---

#### Phase 6 — Implementation Order

Build in this sequence to avoid dependencies:

1. **6E — Tag System** (foundation — tags are used everywhere)
2. **6F — Mistake Library** (foundation — mistakes referenced in trade journal)
3. **6G — Rules Engine** (foundation — rules referenced in daily journal)
4. **6D — Playbook Library** (foundation — playbooks referenced in trade journal)
5. **6H — Manual Trade Entry** (no dependencies — standalone feature, unlocks journaling for non-MT5 trades)
6. **6A — Per-Trade Journal** (uses tags, mistakes, playbooks)
7. **6B — Daily Session Journal** (uses rules engine)
8. **6C — Weekly Review Journal** (uses daily journal data)
9. **6I — Journal UI Components** (builds on all the above)

**Migration file:** `004_journal_system.sql` — single migration that adds all new tables and columns

**Test gate:**
- Create a playbook → link a trade to it → see playbook performance stats
- Tag a trade → filter by tag on dashboard → see tag analytics
- Manually add a trade → see it in trades table with correct P&L calculations → edit it → delete it
- Manual trades survive MT5 sync without being overwritten or duplicated
- Open trade journal → fill pre-trade + post-trade sections → save → reopen and see data persisted
- Open daily journal → see auto-stats → fill reflection → mark rules followed/broken → save
- Open weekly review → see previous week's goals → mark as met/not → set next week goals → save
- View mistake analytics → see top mistakes and their P&L impact

---

### Phase 7 — Reports & export
**Goal:** Shareable reports and data export.

**Backend:**
- Weekly/monthly aggregations query
- CSV export endpoint
- Journal-aware reports (include journal notes, tags, playbook stats in reports)

**Frontend:**
- Reports page: weekly/monthly P&L breakdown
- Heatmaps: performance by time of day, day of week, symbol
- Playbook performance report (win rate, P&L per strategy)
- Mistake frequency report
- Rule adherence trends
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
├── .gitignore
├── vps/                              ← VPS FastAPI bridge (Kamatera)
│   ├── main.py
│   ├── mt5_client.py
│   └── requirements.txt
├── mac/                              ← Mac-side sync + normalizer
│   ├── normalizer.py
│   ├── sync.py
│   ├── requirements.txt
│   └── tests/
├── dashboard/                        ← Next.js app
│   ├── vercel.json                   ← Vercel cron config (daily auto-sync)
│   ├── middleware.ts                 ← route protection (Supabase Auth)
│   ├── app/
│   │   ├── page.tsx                  ← redirect to /settings/accounts or /login
│   │   ├── login/page.tsx            ← email/password sign in
│   │   ├── register/page.tsx         ← create account
│   │   ├── overview/page.tsx         ← main dashboard
│   │   ├── settings/
│   │   │   ├── layout.tsx            ← shared settings layout (Sidebar + SettingsSidebar)
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx          ← profile page (Server Component)
│   │   │   │   └── ProfileForm.tsx   ← editable profile form (Client Component)
│   │   │   ├── security/
│   │   │   │   ├── page.tsx          ← security settings (Server Component)
│   │   │   │   └── PasswordForm.tsx  ← password change form (Client Component)
│   │   │   ├── accounts/
│   │   │   │   ├── page.tsx          ← accounts table (Server Component)
│   │   │   │   └── AccountRow.tsx    ← account row + 3-dot menu (Client Component)
│   │   │   └── connect/
│   │   │       └── page.tsx          ← add new MT5 account (inside settings layout)
│   │   └── api/
│   │       ├── connect/              ← VPS connect + save credentials
│   │       ├── sync/                 ← MT5 → Supabase sync (mutex + rate limit + reconnect)
│   │       ├── select-account/       ← activate an account
│   │       ├── profile/              ← GET/PUT user profile
│   │       ├── security/
│   │       │   └── change-password/  ← POST password change
│   │       ├── account/
│   │       │   ├── delete/           ← DELETE account (FK-ordered)
│   │       │   └── clear-trades/     ← DELETE trades for an account
│   │       ├── cron/
│   │       │   └── sync-all/         ← GET auto-sync all accounts (Vercel Cron)
│   │       └── auth/signout/         ← clear session
│   ├── components/
│   │   ├── Sidebar.tsx               ← main app sidebar (with Profile link)
│   │   ├── SettingsSidebar.tsx        ← settings left nav (USER + GENERAL sections)
│   │   ├── SyncButton.tsx            ← resync button (handles 429 rate limit)
│   │   └── DashboardHeader.tsx       ← header with account dropdown (useTransition)
│   ├── lib/
│   │   ├── supabase.ts               ← SSR-aware Supabase clients (3 variants)
│   │   ├── db.ts                     ← typed DB queries
│   │   ├── vps.ts                    ← VPS API wrapper
│   │   ├── broker.ts                 ← broker types + adapter interface
│   │   ├── normalizer.ts             ← TypeScript deal normalizer
│   │   ├── sync-mutex.ts             ← promise-based VPS access mutex
│   │   └── adapters/
│   │       └── mt5.ts                ← MT5 broker adapter
│   ├── package.json
│   └── .env.local
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql
        ├── 002_auth_accounts.sql
        ├── 003_add_last_synced_at.sql
        ├── 004_journal_system.sql
        └── 005_performance_indexes.sql
```

---

## Scalability pass (Phase 1 — Database indexes)

This is the first of a three-phase scalability pass outlined after the MVP
refactor. The goal of the overall pass is to make the app production-SaaS ready
without blocking feature work. The phases are:

  Phase 1 — Database indexes       (shipped — see below)
  Phase 2 — Pagination + date windowing on server pages
  Phase 3 — Row-Level Security (RLS) + SSR client migration

Phase 1 is intentionally first because it has zero application-code changes,
zero risk, and takes effect immediately on next deploy. Phases 2 and 3 are
documented here as a tracker for future work.

### Why Phase 1 first

Every user-facing page in the app hits the same query shape:

```sql
SELECT * FROM trades
WHERE  account_id IN (...)
  [AND close_time BETWEEN ? AND ?]
ORDER  BY close_time DESC
```

At ~100 trades per user this is fast enough. At ~10k trades per user the
existing single-column indexes force Postgres into a bitmap heap scan plus a
sort step that gets progressively slower. A composite index eliminates both.

### What Phase 1 actually changes

Only one file: `supabase/migrations/005_performance_indexes.sql`.

It creates a single new composite index:

```sql
create index concurrently if not exists trades_account_close_time_idx
  on trades (account_id, close_time desc);
```

No application code, no schema changes, no data migration. The `CONCURRENTLY`
keyword means the table is never locked, so it is safe to run on production.
`IF NOT EXISTS` makes re-running the migration a no-op.

### What was already in place (and therefore NOT re-added)

Pre-existing indexes that already cover their query patterns well:

  sessions(account_id, date desc)  — already composite (migration 001)
  accounts(user_id)                — already exists     (migration 002)
  trades(account_id)               — single column      (migration 001)
  trades(close_time desc)          — single column      (migration 001)
  trades(source)                   — single column      (migration 004)
  trades(playbook_id)              — single column      (migration 004)
  tags(user_id), rules(user_id),
  mistakes(user_id), playbooks(user_id),
  weekly_reviews(user_id)          — all present        (migration 004)

The two single-column indexes on `trades(account_id)` and `trades(close_time)`
are intentionally kept alongside the new composite. They may still be chosen by
queries that filter on only one of the two columns. The storage cost is
negligible at the scale we care about.

### Expected impact

  ~100  trades per user → imperceptible (<5ms either way)
  ~5k   trades per user → 10–30x faster  (200ms → 10ms)
  ~50k  trades per user → 50–100x faster (2s    → 20ms)

Most impact is felt on the Day View page (fetches all trades grouped by date),
the Overview page (daily aggregation for charts and calendar), and the Trade
View table.

### How to apply

The migration is designed to run in the Supabase SQL editor or via the Supabase
CLI (`supabase db push`). Because `CONCURRENTLY` cannot run inside a transaction
block, it must be executed as a standalone statement — the migration file
contains no BEGIN/COMMIT wrapper. Supabase CLI handles this automatically.

### How to verify it worked

After applying, in the Supabase SQL editor:

```sql
EXPLAIN ANALYZE
SELECT * FROM trades
WHERE account_id = '<some-account-uuid>'
ORDER BY close_time DESC
LIMIT 50;
```

Look for `Index Scan using trades_account_close_time_idx` in the plan output.
If the planner is still using the older single-column indexes, run
`ANALYZE trades;` to refresh table statistics — Postgres sometimes needs a
nudge before it starts picking the new index.

## Scalability pass (Phase 2 — Default date window + hard row cap)

### Why
Phase 1 made the queries fast at the database layer, but the app was still
asking for unbounded datasets. Every page that fetched trades (Overview,
Day View, Trade View) pulled the user's *entire* trade history on every
load. That works at 100 trades and dies at 10k. Phase 2 caps the blast
radius at the application layer so even a heavy trader with years of
history can't accidentally ask the server to ship 50,000 rows.

The strategy is two layers of protection, applied together:

1. **Default date window** — if a caller doesn't specify a `from` date,
   we automatically filter to the last 12 months. Callers can still pass
   an explicit older `from` (or even `1970-01-01`) to opt out.
2. **Hard row cap** — every query that returns trade rows is bounded by a
   maximum `LIMIT`. Even with a wide date window, we never return more
   than the cap in one request. `DEFAULT_TRADE_LIMIT = 5000` in
   `lib/db.ts` for general fetches; the Trade View table uses a tighter
   500 because it's a one-shot DOM render without virtual scrolling.

Both constants are constants (not env vars) because they are part of the
product's scalability contract — tightening or loosening them should go
through code review, not a config flip.

### What shipped

**`dashboard/lib/db.ts` — new primitives**
  - `export const DEFAULT_WINDOW_MONTHS = 12` — the lookback applied when
    callers omit `from`.
  - `export const DEFAULT_TRADE_LIMIT = 5000` — hard row cap for
    `getTradesForAccounts`.
  - `function monthsAgoISO(months)` — private helper that returns a
    `YYYY-MM-DD` string for N months before today, used as the default
    lower bound.
  - `export interface GetTradesOptions { from?, to?, limit?, order? }` — an
    options object so callers can pass only the fields they care about
    and we can extend the API without breaking the positional signature.

**`getTradesForAccounts` — breaking signature change**
  - Before: `getTradesForAccounts(accountIds, from?, to?)`
  - After:  `getTradesForAccounts(accountIds, options?: GetTradesOptions)`
  - Defaults inside the function: `from = monthsAgoISO(12)`,
    `limit = 5000`, `order = "asc"`.
  - Still short-circuits to `[]` when `accountIds` is empty so an empty
    call can never turn into a `WHERE account_id IN ()` (which in SQL
    would match no rows, but avoiding the round trip is cheaper).

**`countTradesForAccounts` — new helper**
  - Uses Supabase's `{ count: "exact", head: true }` pattern so it returns
    only a row count in the response headers — no body payload.
  - Same 12-month default window as `getTradesForAccounts`.
  - Intended for pages that want to show "Showing 500 of N trades" when
    the hard cap has truncated the result. Not yet wired into any client
    UI — the helper ships so the client code can adopt it without a
    second backend pass.

**`app/overview/page.tsx` — caller update**
  - Old call `getTradesForAccounts(accountIds, from, to)` would now be a
    TypeScript error because the second argument is typed as
    `GetTradesOptions`. Updated to `getTradesForAccounts(accountIds, { from, to })`.
  - When the user selects `period="all"`, `from` and `to` are both
    `undefined`, which means the 12-month default window kicks in
    automatically. This is the correct behavior for an "unfiltered"
    overview page — "all time" for MVP means "recent enough to matter",
    not "every row since the dawn of the account".

**`app/day-view/page.tsx` — no code change required**
  - Already calls `getTradesForAccounts(accountIds)` with no options
    argument, which means it transparently gets the 12-month default
    window and the 5000-row cap. No edit needed; the defaults flow
    through by construction. URL-driven range picker wiring is deferred
    to Phase 2.1 when the Day View toolbar learns to push query params.

**`app/trades/page.tsx` — direct-query rewrite**
  - This page doesn't use `getTradesForAccounts` — it issues its own
    direct Supabase query so it can order descending (newest first) for
    table display. Added the same two-layer safety inline:
      * Computes `windowFromISO` = 12 months ago (same logic as
        `monthsAgoISO` in `lib/db.ts`, inlined to keep the page
        self-contained).
      * Adds `.gte("close_time", windowFromISO)` to filter to the last
        year, then `.limit(500)` as a hard cap on what the table renders.
  - Local constants `TRADE_VIEW_LIMIT = 500` and `TRADE_VIEW_MONTHS = 12`
    sit at the top of the data fetch block so future reviewers can tune
    them without grepping through the whole file.

### Expected impact

| Trade count per user | Before Phase 2 | After Phase 2 |
|----------------------|----------------|---------------|
| 100                  | 100 rows       | 100 rows      |
| 5,000                | 5,000 rows     | ≤5,000 rows   |
| 50,000               | 50,000 rows    | ≤5,000 rows   |

The worst case — a heavy trader with years of history — is now bounded
instead of unbounded. Combined with the Phase 1 composite index, the
dominant query pattern (`account_id = ? AND close_time >= ? ORDER BY
close_time`) is an index seek + ordered range scan: a few milliseconds
regardless of the total size of the table.

### How to verify it worked

  1. Open DevTools Network tab on the Overview page.
  2. Look at the response size for the Supabase trades request — it
     should stay flat as you accumulate more trades, not grow linearly.
  3. In the Supabase dashboard's "Query Performance" tab, the
     `getTradesForAccounts` query should show a constant execution time
     (~10–30 ms) even as the underlying table grows.
  4. TypeScript check: `npx tsc --noEmit` must report no errors — the
     signature change was the main risk, and every caller has been
     updated.

### What's next (not yet shipped)

Phase 2.1 — Client-facing range controls:
  - Wire the Day View toolbar range picker to URL search params so the
    server actually re-queries when the range changes (currently client
    state only).
  - Add a "Showing X of N" banner to the Trade View table using
    `countTradesForAccounts`, with a hint to narrow the range if
    truncated.
  - Optional cursor pagination on Trade View (cursor = `close_time` of
    the last visible row) for users who want to page through history.

## Scalability pass (Phase 3 — RLS hardening + SSR client migration)

### Why
Phases 1 and 2 made the database fast and the queries bounded. Phase 3
closes the last major scalability / security gap: the user-facing API
routes were all talking to Supabase through the **service-role client**,
which bypasses Row Level Security entirely. That meant the only thing
protecting one user's data from another was a convention — every route
had to remember to add `.eq("user_id", userId)` to every query. One
forgotten filter, one typo in an account-ownership check, and the API
would silently return (or worse, modify) another user's rows.

Phase 3 replaces that convention with a database-level safety net. After
this pass:

  - Every user-facing `apiAuth()` call returns an SSR (anon-key + cookie)
    client whose queries are automatically RLS-scoped to the caller.
  - Every write path on trades, sessions, and accounts has an explicit
    INSERT/UPDATE/DELETE policy keyed to `auth.uid()`.
  - Routes that genuinely need to bypass RLS (the MT5 sync, cron
    sync-all, cascade deletes) use a new, explicitly-named `apiAuthAdmin()`
    helper so they stand out in code review.

The application-level `.eq("user_id", userId)` checks are left in place
intentionally — they're still correct and still faster than relying on
RLS alone, but they're no longer the *only* line of defense.

### What shipped

**`supabase/migrations/006_rls_write_policies.sql` — new migration**

  - **trades**: adds `users insert own trades`, `users update own trades`,
    `users delete own trades`. Each policy uses the same EXISTS subquery
    pattern as the pre-existing SELECT policy: a row is writable iff its
    `account_id` points to an account whose `user_id` matches
    `auth.uid()`. The UPDATE policy has both USING (pre-update row) and
    WITH CHECK (post-update row) clauses so a malicious update can't
    re-parent a trade into another user's account.
  - **sessions**: same three policies, same EXISTS pattern (sessions are
    also scoped by `account_id`).
  - **accounts**: adds `users insert/update/delete own accounts`. These
    are simpler because `accounts` has a direct `user_id` column — the
    policy is just `auth.uid() = user_id`.
  - **tags / mistakes / rules / playbooks / weekly_reviews**: no change
    needed; these already had `FOR ALL` policies from migration 004.
    Documented as comments inside the migration file so future reviewers
    don't wonder why they're missing.
  - Idempotent: every CREATE POLICY is guarded by a DROP POLICY IF EXISTS,
    so the file can be re-run without error.
  - Includes a verification query at the bottom to confirm policy count
    after apply.

**`dashboard/lib/api-helpers.ts` — two-helper split**

  - `apiAuth()` (existing, now changed): returns the SSR client that was
    used to validate the session. The SAME instance is returned to the
    caller so every subsequent query runs with `auth.uid() = <user>` from
    the database's perspective. This is the change that turns RLS from a
    theoretical feature into an actually-enforced boundary for every
    user-facing route.
  - `apiAuthAdmin()` (new): returns the service-role client after first
    validating the session via the SSR client. The auth check guarantees
    a user session still exists (so no unauthenticated access); the
    service-role client bypasses RLS so the route can do cross-user or
    bulk writes. Reserved for: `/api/sync`, `/api/cron/sync-all`,
    `/api/account/delete`, `/api/account/clear-trades`, `/api/connect`.
    All other routes must prefer `apiAuth()`.

**Routes affected by the helper switch**

The seven user-facing routes that call `apiAuth()` are now RLS-scoped:

  - `/api/trades`     — manual entry, journal updates, delete
  - `/api/sessions`   — daily session notes
  - `/api/rules`      — trading rules CRUD
  - `/api/tags`       — tag CRUD
  - `/api/playbooks`  — strategy library CRUD
  - `/api/mistakes`   — mistake library CRUD
  - `/api/weekly-reviews` — weekly review CRUD

No code changes were needed inside these routes — they already use the
`ctx.supa` returned by `apiAuth()` for all their queries, so flipping the
helper to return the SSR client cascades through transparently. Migration
006 is the prerequisite: without the new write policies, the INSERT /
UPDATE / DELETE calls on trades and sessions would start failing.

**Admin routes — no changes required**

The routes that need service-role access (`/api/sync`, `/api/cron/sync-all`,
`/api/account/delete`, `/api/account/clear-trades`, `/api/connect`,
`/api/profile`, `/api/select-account`) already manage their own Supabase
clients directly — they don't go through `apiAuth()`. They call
`createSupabaseServer()` for the auth check and then instantiate
`serverClient()` separately for the bulk work. That's the same pattern
`apiAuthAdmin()` provides, so they're already correct by construction.
The new helper exists primarily for future routes that need admin access
so they can adopt a single canonical pattern.

### Expected impact

Before Phase 3:
  - A leaked or forgotten `user_id` filter in any user-facing route =
    silent data exposure. Only defense: code review.
  - Service role key is effectively the only credential the app uses.

After Phase 3:
  - Every user-facing route is RLS-scoped. A forgotten `user_id` filter
    simply returns zero rows — the database refuses to hand over data the
    caller isn't authorized to see.
  - Service role usage is isolated to the five admin routes listed above.
    A grep for `serverClient()` outside those files now signals a code
    smell that should be reviewed.
  - Performance: negligible overhead. RLS policies compile to a WHERE
    clause that piggybacks on the same indexes the application filter
    would have used. The EXISTS subquery on trades/sessions uses the
    `accounts_user_id_idx` created back in migration 002.

### How to apply

  1. Open the Supabase SQL editor (or run `supabase db push` locally).
  2. Paste the contents of `006_rls_write_policies.sql` and Run.
  3. Verify policies were created by running the verification query
     inside the migration (the SELECT against `pg_policies`). Each of
     `trades`, `sessions`, and `accounts` should show four `users ...`
     policies plus one `service role full access`.

### How to verify it worked

  1. **Smoke test** — sign in as an existing user and exercise the
     affected flows: add a manual trade, edit journal notes on an
     existing trade, create/edit a rule, add a tag, etc. Everything
     should behave exactly as before (the RLS policies are permissive
     for the row's owner).
  2. **Negative test** (optional, requires two accounts) — from user A's
     session, make a direct API call like
     `PUT /api/trades` with a trade ID that belongs to user B. The
     response should be 404 (`notFoundResponse`) rather than a successful
     update, because user A's SSR client can't SELECT user B's row in
     the ownership check, so the route short-circuits.
  3. **TypeScript** — `npx tsc --noEmit` must return clean. The helper
     signature change is additive, so no call sites should break.

### What's next (not yet shipped)

Phase 3.1 — lib/db.ts migration:
  - Currently `lib/db.ts` helpers (`getAccountsByUserId`,
    `getTradesForAccounts`, etc.) use `serverClient()` directly, which
    means server components reading via these helpers still bypass RLS.
    This is safe today because every page calls `requireAuth()` and
    filters by `user.id` explicitly, but the same defense-in-depth
    argument from Phase 3 applies.
  - Plan: accept an optional `SupabaseClient` parameter on each helper,
    defaulting to `serverClient()` for backward compat. Server components
    then pass `await createSupabaseServer()`. The sync job keeps its
    current behavior by simply not passing anything.

Phase 3.2 — Observability + rate limiting:
  - Structured logging of RLS-denied queries in production (these
    currently silently return `[]`).
  - Rate limiter on write endpoints (Upstash Ratelimit or similar) keyed
    by `user.id` to prevent a compromised session from fanning out.


---

## Feature: Rich Notes + Template Library (v1)

### Goal
Upgrade `trades.notes` and `sessions.notes` from plain textareas to a rich
text editor with a per-user Template library, matching the Tradezella
"Create template" modal reference (three-section sidebar: Favourites,
Recommended, My templates).

### Answered design decisions
- **Editor**: TipTap (ProseMirror), dynamically imported, SSR disabled.
- **Storage format**: JSON (TipTap AST) is source of truth, HTML is a
  serialized snapshot, `notes` plain-text kept for legacy/search.
- **Scope v1**: Main Notes field on `TradeJournalPanel` + `DailyJournal`
  only. Sub-fields (went well, emotion notes, etc.) stay plain.
- **Template scope**: Single shared library (no kind discriminator on
  templates). Any template can be used from any note surface.
- **Defaults**: Per-user, per-kind (trade vs journal). Two bool flags on
  the template row, enforced unique per user via partial indexes. When a
  note is opened with empty `notes_json`, the matching default auto-inserts.
- **Images**: Private Supabase Storage bucket `note-images`, path
  `{user_id}/{uuid}.{ext}`, served via short-lived signed URLs.
- **Recommended templates**: Seeded rows with `user_id = null` inside the
  same `note_templates` table. RLS reads allow
  `user_id = auth.uid() OR user_id is null`; writes require
  `user_id = auth.uid()`. Ship ~10 starter templates.
- **Favourites**: Separate join table `note_template_favourites` so users
  can favourite both their own rows and global Recommended rows.
- **Setting a Recommended template as default**: Duplicates it into the
  user's library first, then sets the default flag. "When you pin a
  default, the template becomes yours."
- **Not in v1**: slash menu, voice-to-text, markdown/PDF export, merge
  fields, template versioning, sharing, orphaned-image sweep.

### Schema (migration 007)

```
note_templates
  id                  uuid pk default gen_random_uuid()
  user_id             uuid null references auth.users(id) on delete cascade
  name                text not null
  content_json        jsonb not null
  content_html        text not null
  is_default_trade    bool default false
  is_default_journal  bool default false
  created_at          timestamptz default now()
  updated_at          timestamptz default now()

-- one default per kind per user
create unique index note_templates_one_default_trade
  on note_templates(user_id) where is_default_trade = true;
create unique index note_templates_one_default_journal
  on note_templates(user_id) where is_default_journal = true;

note_template_favourites
  user_id     uuid references auth.users(id) on delete cascade
  template_id uuid references note_templates(id) on delete cascade
  created_at  timestamptz default now()
  primary key (user_id, template_id)

alter table trades   add column notes_json jsonb, add column notes_html text;
alter table sessions add column notes_json jsonb, add column notes_html text;
```

### RLS policies
- `note_templates`:
  - SELECT: `user_id = auth.uid() OR user_id is null`
  - INSERT: `user_id = auth.uid()` (cannot create global rows from client)
  - UPDATE: `user_id = auth.uid()` USING + WITH CHECK
  - DELETE: `user_id = auth.uid()`
- `note_template_favourites`:
  - All four verbs scoped to `user_id = auth.uid()`
- `storage.objects` (bucket `note-images`):
  - Read + Write scoped to
    `(storage.foldername(name))[1]::uuid = auth.uid()`

### Modular file layout
Every concern lives in its own file. No "mega components". This is a
hard rule — if a file grows past ~300 lines it gets split.

```
lib/editor/
  extensions.ts             TipTap extension bundle (single source of truth)
  serialize.ts              jsonToHtml, jsonToPlainText helpers
  defaults.ts               emptyDoc(), isEmptyDoc()

components/editor/
  RichNoteEditor.tsx        Public wrapper, dynamic import of the impl
  RichNoteEditorImpl.tsx    Real TipTap instance (ssr: false)
  EditorToolbar.tsx         Toolbar UI, receives editor instance as prop
  toolbar/
    ToolbarButton.tsx       Base button primitive
    MarkButtons.tsx         B / I / U / S
    HeadingMenu.tsx         H1 / H2 / H3 / paragraph
    ListButtons.tsx         bullet / ordered / task
    AlignButtons.tsx        left / center / right
    FontFamilyMenu.tsx
    FontSizeMenu.tsx
    ColorMenu.tsx
    HighlightMenu.tsx
    LinkButton.tsx
    ImageButton.tsx         triggers upload + inserts Image node
    UndoRedo.tsx
    FullscreenButton.tsx
  TemplatePickerMenu.tsx    In-editor "Templates ▾" dropdown
  useImageUpload.ts         Hook: requests signed URL, uploads, returns URL

components/templates/
  TemplateEditorModal.tsx   Big modal shell (matches Tradezella reference)
  TemplateSidebar.tsx       Search + Favourites + Recommended + My sections
  TemplateSidebarItem.tsx   One row in the sidebar
  TemplateTitleBar.tsx      Title input + Cancel/Save buttons
  useTemplates.ts           SWR-style hook: list/create/update/delete
  useTemplateFavourites.ts  Hook: toggle favourite
  useTemplateDefaults.ts    Hook: set default for trade/journal

app/api/note-templates/
  route.ts                  GET (list own + globals), POST (create)
  [id]/route.ts             PATCH (update), DELETE
  [id]/favourite/route.ts   POST { value: bool }
  [id]/default/route.ts     POST { kind: 'trade'|'journal', value: bool }
  [id]/duplicate/route.ts   POST (copy a Recommended row into own library)

app/api/note-images/
  sign/route.ts             POST → { uploadUrl, publicPath }

supabase/migrations/
  007_note_templates_and_rich_notes.sql
  007b_seed_recommended_templates.sql   (10 starter templates)
```

### Flow: opening a trade note
1. `TradeJournalPanel` mounts, reads `trade.notes_json` from props.
2. If non-null → hydrate `<RichNoteEditor valueJson={...} />`.
3. If null → call `GET /api/note-templates?default=trade`. If a default
   template exists, insert its `content_json` as the initial value.
   Otherwise start with an empty doc.
4. On save (blur + debounced autosave), editor emits
   `{ json, html, plain }`; API writes `notes_json`, `notes_html`, `notes`.

### Flow: opening the Template modal
1. User clicks "Templates ▾" → "Manage templates" (or "New template").
2. Modal opens with sidebar sections loaded from
   `GET /api/note-templates` (returns `{ mine: [], recommended: [],
   favourites: [] }`).
3. Selecting a sidebar row loads its `content_json` into the right-pane
   editor. Recommended rows are read-only — the title bar shows a
   "Duplicate to my templates" button instead of Save.
4. Save posts to `POST /api/note-templates` (new) or
   `PATCH /api/note-templates/[id]` (existing).

### Seeded Recommended templates
1. Daily Game Plan
2. Pre-Market Prep
3. Intra-day Check-in
4. Trade Recap: Basic
5. Trade Recap: Timeframe Bias
6. Weekly Recap
7. Weekly Report Card
8. Monthly Report Card
9. Emotion Check-in
10. Strengths & Weaknesses

Each seeded as a TipTap JSON doc (with a matching HTML snapshot) via a
SQL `insert ... values` in `007b_seed_recommended_templates.sql`. The
content is curated markdown-like scaffolding (headings + placeholder
bullets) the user fills in after inserting.

### Build order (each step is an atomic commit)
1. Migration 007 + 007b.
2. Storage bucket policy SQL + `/api/note-images/sign`.
3. Install `@tiptap/react @tiptap/starter-kit @tiptap/extension-*` deps.
4. `lib/editor/*` (extensions, serialize, defaults).
5. `components/editor/toolbar/*` primitives.
6. `RichNoteEditor` + `RichNoteEditorImpl` + `EditorToolbar`.
7. `components/templates/*` + hooks.
8. Template CRUD API routes.
9. `TemplatePickerMenu` + wire into editor toolbar.
10. Replace textarea in `TradeJournalPanel` + `DailyJournal`, add
    default-on-empty auto-insert.
11. `npx tsc --noEmit`, remove feature flag, ship.

### Debuggability principles enforced throughout
- Every file has a header comment explaining its role and why it's
  separate from its siblings.
- Hooks (`useTemplates`, `useImageUpload`, etc.) never touch React state
  of unrelated features — one hook per concern.
- API routes are thin: auth → parse → call a helper in `lib/` → respond.
  Business logic never lives inline in a route handler.
- TipTap extension list is defined once in `lib/editor/extensions.ts`
  and imported everywhere, so enabling/disabling a feature is a one-line
  change.
- Toolbar buttons each live in their own file so adding/removing a tool
  doesn't require touching the main toolbar component.
