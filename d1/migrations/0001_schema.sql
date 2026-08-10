-- ============================================================================
--  Haus-Quest – Schema für Cloudflare D1 (SQLite)
--
--  Wird als Migration automatisch eingespielt (siehe README).
--
--  Die Regeln stecken in der Datenbank, nicht nur in der Oberfläche:
--  Eine Meldung, die dieselbe Person bestätigt, die sie gemeldet hat, wird
--  abgewiesen. Punktestände werden gerechnet, nie gesetzt.
--
--  Der Zugriffsschutz liegt im Worker: die App spricht nie direkt mit der
--  Datenbank, sondern nur über die Schnittstelle, die vorher prüft, wer fragt
--  und zu welchem Paar die Person gehört.
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

-- Ein Paar besteht aus genau zwei Personen.
create trigger members_max_two
before insert on members
for each row
begin
  select raise(abort, 'Ein Paar besteht aus genau zwei Personen')
  where (select count(*) from members where couple_id = new.couple_id) >= 2;
end;

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

create trigger claim_decide_once
before update of status on claims
for each row when old.status <> 'offen' and new.status <> old.status
begin
  select raise(abort, 'Diese Meldung ist bereits entschieden');
end;

-- Das Vier-Augen-Prinzip. Selbstbestätigung ist hier zu Ende, egal was die App schickt.
create trigger claim_no_self_decide
before update of status on claims
for each row when new.status <> 'offen'
begin
  select raise(abort, 'Eine Meldung muss vom jeweils anderen bestätigt werden')
  where new.decided_by is null or new.decided_by = new.claimed_by
     or not exists (select 1 from members
                    where user_id = new.decided_by and couple_id = new.couple_id);
end;

-- Erst die Bestätigung erzeugt die Buchung.
create trigger claim_confirm_ledger
after update of status on claims
for each row when new.status = 'bestaetigt' and old.status = 'offen'
begin
  insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
  values (lower(hex(randomblob(16))), new.couple_id, new.claimed_by,
          new.quantity * new.points_each,
          (select name from quests where id = new.quest_id), 'claim', new.id);
end;

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

create trigger request_decide_once
before update of status on requests
for each row when old.status <> 'offen' and new.status <> old.status
begin
  select raise(abort, 'Dieser Antrag ist bereits entschieden');
end;

create trigger request_no_self_decide
before update of status on requests
for each row when new.status <> 'offen'
begin
  select raise(abort, 'Ein Antrag muss vom jeweils anderen entschieden werden')
  where new.decided_by is null or new.decided_by = new.requested_by;
end;

create trigger request_check_balance
before update of status on requests
for each row when new.status = 'bestaetigt' and old.status = 'offen'
begin
  select raise(abort, 'Zu wenig Punkte für diese Belohnung')
  where (select coalesce(sum(delta), 0) from ledger
         where member_id = new.requested_by) < new.cost;
end;

create trigger request_approve_ledger
after update of status on requests
for each row when new.status = 'bestaetigt' and old.status = 'offen'
begin
  insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
  values (lower(hex(randomblob(16))), new.couple_id, new.requested_by,
          -new.cost, (select name from rewards where id = new.reward_id), 'request', new.id);
end;

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

create trigger transfer_decide_once
before update of status on transfers
for each row when old.status <> 'offen' and new.status <> old.status
begin
  select raise(abort, 'Diese Übertragung ist bereits entschieden');
end;

create trigger transfer_check_balance
before update of status on transfers
for each row when new.status = 'bestaetigt' and old.status = 'offen'
begin
  select raise(abort, 'Zu wenig Punkte für die Übertragung')
  where (select coalesce(sum(delta), 0) from ledger
         where member_id = new.from_member) < new.amount;
end;

create trigger transfer_accept_ledger
after update of status on transfers
for each row when new.status = 'bestaetigt' and old.status = 'offen'
begin
  insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
  values (lower(hex(randomblob(16))), new.couple_id, new.from_member,
          -new.amount, 'Punkte übertragen', 'transfer', new.id);
  insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id)
  values (lower(hex(randomblob(16))), new.couple_id, new.to_member,
          new.amount, 'Punkte erhalten', 'transfer', new.id);
end;

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

-- Ein Nein beendet den Vorschlag. Der alte Wert gilt weiter.
create trigger proposal_reject
after insert on proposal_votes
for each row when new.answer = 0
begin
  update proposals set status = 'abgelehnt', decided_at = datetime('now')
  where id = new.proposal_id and status = 'offen';
end;

-- Übernommen wird erst, wenn beide zugestimmt haben.
create trigger proposal_accept_quest_points
after insert on proposal_votes
for each row when new.answer = 1
  and (select count(*) from proposal_votes where proposal_id = new.proposal_id and answer = 1) >= 2
  and (select kind from proposals where id = new.proposal_id) = 'quest_points'
  and (select status from proposals where id = new.proposal_id) = 'offen'
begin
  update quests set points = (select new_value from proposals where id = new.proposal_id)
  where id = (select target_id from proposals where id = new.proposal_id);
  update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = new.proposal_id;
end;

create trigger proposal_accept_reward_cost
after insert on proposal_votes
for each row when new.answer = 1
  and (select count(*) from proposal_votes where proposal_id = new.proposal_id and answer = 1) >= 2
  and (select kind from proposals where id = new.proposal_id) = 'reward_cost'
  and (select status from proposals where id = new.proposal_id) = 'offen'
begin
  update rewards set cost = (select new_value from proposals where id = new.proposal_id)
  where id = (select target_id from proposals where id = new.proposal_id);
  update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = new.proposal_id;
end;

create trigger proposal_accept_new_quest
after insert on proposal_votes
for each row when new.answer = 1
  and (select count(*) from proposal_votes where proposal_id = new.proposal_id and answer = 1) >= 2
  and (select kind from proposals where id = new.proposal_id) = 'new_quest'
  and (select status from proposals where id = new.proposal_id) = 'offen'
begin
  insert into quests (id, couple_id, name, category, points)
  select lower(hex(randomblob(16))), couple_id, name,
         coalesce(category, 'Sonstiges'), new_value
  from proposals where id = new.proposal_id;
  update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = new.proposal_id;
end;

create trigger proposal_accept_new_reward
after insert on proposal_votes
for each row when new.answer = 1
  and (select count(*) from proposal_votes where proposal_id = new.proposal_id and answer = 1) >= 2
  and (select kind from proposals where id = new.proposal_id) = 'new_reward'
  and (select status from proposals where id = new.proposal_id) = 'offen'
begin
  insert into rewards (id, couple_id, name, cost)
  select lower(hex(randomblob(16))), couple_id, name, new_value
  from proposals where id = new.proposal_id;
  update proposals set status = 'bestaetigt', decided_at = datetime('now') where id = new.proposal_id;
end;

-- ---------------------------------------------------------------- Benachrichtigungen
create table push_subscriptions (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at text not null default (datetime('now'))
);
