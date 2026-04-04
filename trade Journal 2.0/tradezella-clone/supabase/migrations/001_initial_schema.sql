-- ============================================================
-- 001_initial_schema.sql
-- Paste this entire file into Supabase SQL Editor and click Run.
-- ============================================================

-- ------------------------------------------------------------
-- accounts
-- One row per MT5 account (identified by broker login number)
-- ------------------------------------------------------------
create table if not exists accounts (
  id          uuid primary key default gen_random_uuid(),
  login       bigint unique not null,   -- MT5 account number
  name        text,
  broker      text,                      -- e.g. "ICMarkets-MT5"
  currency    text,
  balance     numeric,
  equity      numeric,
  leverage    integer,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ------------------------------------------------------------
-- trades
-- One row per completed round-trip trade (entry + exit)
-- ------------------------------------------------------------
create table if not exists trades (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid references accounts(id) on delete cascade,
  position_id       bigint not null,     -- MT5 position_id (unique per round trip)
  ticket            bigint,              -- exit deal ticket
  symbol            text not null,
  direction         text not null check (direction in ('buy', 'sell')),
  lot_size          numeric not null,
  open_price        numeric,
  close_price       numeric,
  sl                numeric,
  tp                numeric,
  open_time         timestamptz,
  close_time        timestamptz,
  duration_minutes  integer,
  pnl               numeric,            -- gross profit from MT5
  pnl_pips          numeric,
  commission        numeric default 0,
  swap              numeric default 0,
  net_pnl           numeric,            -- pnl + commission + swap
  tags              text[] default '{}',
  notes             text,
  setup_type        text,
  mood              text,
  mistakes          text,
  screenshot_url    text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  -- Prevent duplicate imports
  unique (account_id, position_id)
);

-- ------------------------------------------------------------
-- sessions  (daily trading session summaries)
-- ------------------------------------------------------------
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references accounts(id) on delete cascade,
  date         date not null,
  total_pnl    numeric default 0,
  trade_count  integer default 0,
  notes        text,
  unique (account_id, date)
);

-- ------------------------------------------------------------
-- tags
-- ------------------------------------------------------------
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  color      text default '#6366f1',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Indexes for common query patterns
-- ------------------------------------------------------------
create index if not exists trades_account_id_idx    on trades(account_id);
create index if not exists trades_close_time_idx    on trades(close_time desc);
create index if not exists trades_symbol_idx        on trades(symbol);
create index if not exists trades_direction_idx     on trades(direction);
create index if not exists sessions_account_date_idx on sessions(account_id, date desc);

-- ------------------------------------------------------------
-- updated_at trigger (auto-set on row updates)
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger accounts_updated_at
  before update on accounts
  for each row execute function set_updated_at();

create or replace trigger trades_updated_at
  before update on trades
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Row Level Security (open for now — lock down after auth added)
-- ------------------------------------------------------------
alter table accounts enable row level security;
alter table trades   enable row level security;
alter table sessions enable row level security;
alter table tags     enable row level security;

-- Allow service role full access (used by Mac sync script)
create policy "service role full access" on accounts
  for all using (true);
create policy "service role full access" on trades
  for all using (true);
create policy "service role full access" on sessions
  for all using (true);
create policy "service role full access" on tags
  for all using (true);
