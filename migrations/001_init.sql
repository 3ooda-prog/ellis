-- Ellis initial schema. Follows ELLIS_HANDOVER §3 with these deliberate additions:
--   users.timezone        resolve "tomorrow at 9" against the user's clock, not the server's
--   records.version       optimistic concurrency; every update bumps it
--   records.updated_at    for sync and audit
--   auth_tokens           bearer-token auth (hashed; plaintext is shown once)
--   check constraints     the status/kind vocabularies are enforced by the database too
-- areas is created before companions because companions.area_id references it.

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  timezone      text not null default 'UTC',
  created_at    timestamptz not null default now()
);

create table auth_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text unique not null,          -- sha256 hex of the bearer token
  label         text not null default '',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  revoked_at    timestamptz
);

create table areas (                           -- "projects" in the brief
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  key           text not null,                 -- stable: design|family|houses|priorities|trading|coding
  name          text not null,                 -- user-renameable
  description   text not null default '',
  status        text not null default 'active' check (status in ('active', 'archived')),
  unique (user_id, key)
);

create table companions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text not null,
  role          text not null check (role in ('coach', 'business', 'family', 'trader', 'coder', 'custom')),
  persona       text not null default '' check (char_length(persona) <= 400),
  area_id       uuid references areas(id) on delete set null,
  voice         jsonb not null default '{}',
  appearance    jsonb not null default '{}',
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);
-- exactly one primary (Ellis) per user
create unique index companions_one_primary on companions (user_id) where is_primary;

create table conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  companion_id  uuid references companions(id) on delete set null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index on conversations (user_id, companion_id, started_at desc);

create table turns (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  source          text not null default 'text' check (source in ('text', 'voice')),
  created_at      timestamptz not null default now()
);
create index on turns (conversation_id, created_at);

create table records (                         -- memories, tasks, events, decisions
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null check (kind in ('fact', 'task', 'event', 'decision')),
  text          text not null check (char_length(text) between 1 and 500),
  due_at        timestamptz,
  area_id       uuid references areas(id) on delete set null,
  status        text not null default 'active'
                check (status in ('active', 'candidate', 'superseded', 'done', 'deleted')),
  confidence    text not null default 'explicit' check (confidence in ('explicit', 'inferred')),
  sensitive     boolean not null default false,
  source_conversation_id  uuid references conversations(id) on delete set null,
  source_external         text,              -- e.g. 'gmail:<thread_id>'
  created_by_companion_id uuid references companions(id) on delete set null,
  supersedes_id uuid references records(id) on delete set null,
  review_at     timestamptz,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz                    -- done or superseded
);
create index on records (user_id, status, kind);
create index on records (user_id, due_at);
-- No two live records with the same wording. Enforced here so two concurrent
-- requests cannot both insert the duplicate the validator was meant to drop.
create unique index records_live_text_unique on records (user_id, lower(text))
  where status in ('active', 'candidate');

create table reminders (
  id            uuid primary key default gen_random_uuid(),
  record_id     uuid not null references records(id) on delete cascade,
  fire_at       timestamptz not null,
  channel       text not null default 'push',
  status        text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  sent_at       timestamptz
);
create index on reminders (status, fire_at);

create table recaps (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  span          text not null check (span in ('day', 'week')),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  text          text not null,
  record_ids    uuid[] not null,               -- exactly what it was built from
  created_at    timestamptz not null default now()
);

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  action        text not null,                 -- record.create, record.supersede, extraction.error...
  target        text,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index on audit_log (user_id, created_at);
