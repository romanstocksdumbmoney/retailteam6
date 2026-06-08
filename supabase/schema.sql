create extension if not exists "pgcrypto";

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists preferences (
  household_id uuid primary key references households(id) on delete cascade,
  send_time text not null default '04:00',
  timezone text not null default 'America/New_York',
  recipient_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_tokens (
  household_id uuid primary key references households(id) on delete cascade,
  email text,
  access_token text,
  refresh_token text,
  scope text,
  token_type text,
  expiry_date bigint,
  updated_at timestamptz not null default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists flagged_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  task text not null,
  source text,
  due_at timestamptz,
  is_flagged boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  briefing_date date not null,
  content text not null,
  partner_text text not null,
  caregiver_text text not null,
  status text not null default 'drafted',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(household_id, briefing_date)
);
