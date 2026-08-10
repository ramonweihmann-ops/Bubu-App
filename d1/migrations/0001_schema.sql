-- ============================================================================
--  Haus-Quest – Schema für Cloudflare D1 (SQLite)
--
--  Wird als Migration automatisch eingespielt (siehe README).
--
--  Punktestände werden gerechnet, nie gespeichert: siehe Ansicht „balances".
--
--  Das Vier-Augen-Prinzip steht als CHECK in den Tabellen (decided_by <> claimed_by)
--  und wird zusätzlich in worker/api.js geprüft. Die App spricht nie direkt mit
--  der Datenbank, sondern nur über die Schnittstelle — Selbstbestätigung ist damit
--  auf beiden Ebenen ausgeschlossen.
--
--  Bewusst ohne Trigger: D1 kann Trigger mit BEGIN…END über die Fernschnittstelle
--  nicht einspielen (es zerlegt die Datei an Semikolons). Die Buchungen entstehen
--  deshalb in derselben Transaktion wie die Entscheidung, siehe api.js.
-- ============================================================================

pragma foreign_keys = on;

-- ---------------------------------------------------------------- Konten
create table users (
  id         text primary key,              -- Google-Subject, stabil je Konto
  email      text not null,
  name       text not null,
  avatar_url text,
  created_at text not null default (datetime('now'))
);

create table sessions (
  token_hash text primary key,              -- nur der Hash, nie das Original
  user_id    text not null references users(id) on delete cascade,
  created_at text not null default (datetime('now')),
  expires_at text not null
);
create index sessions_user_idx on sessions(user_id);

-- ---------------------------------------------------------------- Paar
create table couples (
  id                text primary key,
  created_at        text not null default (datetime('now')),
  pair_code         text unique,
  pair_code_expires text
);

create table members (
  user_id   text primary key references users(id) on delete cascade,
  couple_id text not null references couples(id) on delete cascade,
  joined_at text not null default (datetime('now'))
);
create index members_couple_idx on members(couple_id);

-- ---------------------------------------------------------------- Quests & Belohnungen
create table quests (
  id         text primary key,
  couple_id  text not null references couples(id) on delete cascade,
  name       text not null,
  category   text not null default 'Sonstiges',
  points     integer not null check (points > 0),
  active     integer not null default 1,
  created_at text not null default (datetime('now'))
);
create index quests_couple_idx on quests(couple_id, active);

create table rewards (
  id        text primary key,
  couple_id text not null references couples(id) on delete cascade,
  name      text not null,
  cost      integer not null check (cost > 0),
  active    integer not null default 1
);
create index rewards_couple_idx on rewards(couple_id, active);

-- ---------------------------------------------------------------- Buchungen
-- Wird ausschließlich von Triggern gefüllt. Die Schnittstelle schreibt hier nie hinein.
create table ledger (
  id          text primary key,
  couple_id   text not null references couples(id) on delete cascade,
  member_id   text not null references users(id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  source_type text not null,
  source_id   text,
  created_at  text not null default (datetime('now'))
);
create index ledger_member_idx on ledger(couple_id, member_id);
create index ledger_zeit_idx on ledger(couple_id, created_at desc);

-- Punktestände: immer gerechnet, nie gespeichert.
create view balances as
  select couple_id, member_id, coalesce(sum(delta), 0) as points
  from ledger group by couple_id, member_id;

-- ---------------------------------------------------------------- Meldungen
create table claims (
  id          text primary key,
  couple_id   text not null references couples(id) on delete cascade,
  quest_id    text not null references quests(id),
  claimed_by  text not null references users(id) on delete cascade,
  quantity    integer not null default 1 check (quantity > 0),
  points_each integer not null,               -- eingefroren beim Melden
  note        text,
  status      text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')),
  decided_by  text references users(id),
  decided_at  text,
  created_at  text not null default (datetime('now')),
  check (decided_by is null or decided_by <> claimed_by)
);
create index claims_offen_idx on claims(couple_id, status);

-- ---------------------------------------------------------------- Anträge auf Belohnungen
create table requests (
  id           text primary key,
  couple_id    text not null references couples(id) on delete cascade,
  reward_id    text not null references rewards(id),
  requested_by text not null references users(id) on delete cascade,
  cost         integer not null,             -- eingefroren beim Stellen
  wish_date    text,
  message      text,
  status       text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')),
  decided_by   text references users(id),
  decided_at   text,
  created_at   text not null default (datetime('now')),
  check (decided_by is null or decided_by <> requested_by)
);
create index requests_offen_idx on requests(couple_id, status);

-- ---------------------------------------------------------------- Punkte übertragen
create table transfers (
  id          text primary key,
  couple_id   text not null references couples(id) on delete cascade,
  from_member text not null references users(id) on delete cascade,
  to_member   text not null references users(id) on delete cascade,
  amount      integer not null check (amount > 0),
  message     text,
  status      text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')),
  decided_at  text,
  created_at  text not null default (datetime('now')),
  check (from_member <> to_member)
);
create index transfers_offen_idx on transfers(couple_id, status);

-- ---------------------------------------------------------------- Abstimmungen
create table proposals (
  id         text primary key,
  couple_id  text not null references couples(id) on delete cascade,
  kind       text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward')),
  target_id  text,
  old_value  integer,
  new_value  integer not null check (new_value > 0),
  name       text,
  category   text,
  reason     text,
  created_by text not null references users(id) on delete cascade,
  status     text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')),
  decided_at text,
  created_at text not null default (datetime('now'))
);
create index proposals_offen_idx on proposals(couple_id, status);

create table proposal_votes (
  proposal_id text not null references proposals(id) on delete cascade,
  member_id   text not null references users(id) on delete cascade,
  answer      integer not null check (answer in (0, 1)),
  voted_at    text not null default (datetime('now')),
  primary key (proposal_id, member_id)
);

-- ---------------------------------------------------------------- Benachrichtigungen
create table push_subscriptions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at text not null default (datetime('now'))
);
