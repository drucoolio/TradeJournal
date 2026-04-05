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
        └── 003_add_last_synced_at.sql
```
