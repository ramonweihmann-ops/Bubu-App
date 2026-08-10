-- ============================================================================
--  Bubu App – Schema für ein EIGENES Supabase-Projekt
--  Nicht in der Webportal-Instanz ausführen. Eigenes Projekt, eigene Auth,
--  eigene Datenbank – siehe README, Abschnitt „Strikt getrennt vom Webportal“.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Paar & Mitglieder
create table public.couples (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  pair_code         text unique,
  pair_code_expires timestamptz
);

create table public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  couple_id    uuid not null references public.couples(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  joined_at    timestamptz not null default now()
);
-- Ein Konto gehört zu genau einem Paar; ein Paar hat höchstens zwei Mitglieder.
create index members_couple_idx on public.members(couple_id);

create or replace function public.members_max_two() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.members where couple_id = new.couple_id) >= 2 then
    raise exception 'Ein Paar besteht aus genau zwei Personen';
  end if;
  return new;
end $$;
create trigger trg_members_max_two before insert on public.members
  for each row execute function public.members_max_two();

-- Aktuelles Paar der angemeldeten Person – Basis aller Zugriffsregeln.
create or replace function public.current_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------- Quests & Belohnungen
create table public.quests (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  name       text not null,
  category   text not null default 'Sonstiges',
  points     int  not null check (points > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rewards (
  id        uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  name      text not null,
  cost      int  not null check (cost > 0),
  active    boolean not null default true
);

-- ---------------------------------------------------------------- Buchungen (nur maschinell)
create table public.ledger (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  member_id   uuid not null references public.members(user_id) on delete cascade,
  delta       int  not null,
  reason      text not null,
  source_type text not null,
  source_id   uuid,
  created_at  timestamptz not null default now()
);
create index ledger_member_idx on public.ledger(couple_id, member_id);

-- Punktestände werden immer gerechnet, nie gesetzt.
create view public.balances with (security_invoker = true) as
  select couple_id, member_id, coalesce(sum(delta), 0)::int as points
  from public.ledger group by couple_id, member_id;

-- ---------------------------------------------------------------- Meldungen (Vier-Augen-Prinzip)
create type public.decision as enum ('offen', 'bestaetigt', 'abgelehnt');

create table public.claims (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  quest_id     uuid not null references public.quests(id) on delete restrict,
  claimed_by   uuid not null references public.members(user_id) on delete cascade,
  quantity     int  not null default 1 check (quantity > 0),
  points_each  int  not null,          -- eingefroren beim Melden
  note         text,
  photo_path   text,
  status       public.decision not null default 'offen',
  decided_by   uuid references public.members(user_id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint claim_not_self_decided check (decided_by is null or decided_by <> claimed_by)
);

-- Punktwert einfrieren: es gilt der Wert zum Zeitpunkt der Meldung.
create or replace function public.claim_freeze_points() returns trigger language plpgsql as $$
begin
  select points into new.points_each from public.quests where id = new.quest_id;
  if new.points_each is null then raise exception 'Quest nicht gefunden'; end if;
  return new;
end $$;
create trigger trg_claim_freeze before insert on public.claims
  for each row execute function public.claim_freeze_points();

-- Die Regel selbst: gutgeschrieben wird nur, was der jeweils andere freigibt.
create or replace function public.claim_decide() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if old.status <> 'offen' then
    raise exception 'Diese Meldung ist bereits entschieden';
  end if;
  if new.decided_by is null then
    raise exception 'Entscheidung braucht eine Person';
  end if;
  if new.decided_by = new.claimed_by then
    raise exception 'Eine Meldung muss vom jeweils anderen bestätigt werden';
  end if;
  if not exists (select 1 from public.members m
                 where m.user_id = new.decided_by and m.couple_id = new.couple_id) then
    raise exception 'Entscheidung nur innerhalb des Paares';
  end if;

  new.decided_at := now();
  if new.status = 'bestaetigt' then
    insert into public.ledger (couple_id, member_id, delta, reason, source_type, source_id)
    values (new.couple_id, new.claimed_by, new.quantity * new.points_each,
            'Quest bestätigt', 'claim', new.id);
  end if;
  return new;
end $$;
create trigger trg_claim_decide before update on public.claims
  for each row execute function public.claim_decide();

-- ---------------------------------------------------------------- Anträge auf Belohnungen
create table public.requests (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  reward_id    uuid not null references public.rewards(id) on delete restrict,
  requested_by uuid not null references public.members(user_id) on delete cascade,
  cost         int  not null,           -- eingefroren beim Stellen
  wish_date    date,
  message      text,
  status       public.decision not null default 'offen',
  decided_by   uuid references public.members(user_id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint request_not_self_decided check (decided_by is null or decided_by <> requested_by)
);

create or replace function public.request_freeze_cost() returns trigger language plpgsql as $$
begin
  select cost into new.cost from public.rewards where id = new.reward_id;
  if new.cost is null then raise exception 'Belohnung nicht gefunden'; end if;
  return new;
end $$;
create trigger trg_request_freeze before insert on public.requests
  for each row execute function public.request_freeze_cost();

create or replace function public.request_decide() returns trigger language plpgsql as $$
declare v_balance int;
begin
  if new.status = old.status then return new; end if;
  if old.status <> 'offen' then raise exception 'Dieser Antrag ist bereits entschieden'; end if;
  if new.decided_by is null or new.decided_by = new.requested_by then
    raise exception 'Ein Antrag muss vom jeweils anderen entschieden werden';
  end if;

  new.decided_at := now();
  if new.status = 'bestaetigt' then
    select coalesce(sum(delta), 0) into v_balance
      from public.ledger where member_id = new.requested_by;
    if v_balance < new.cost then
      raise exception 'Zu wenig Punkte: % von % vorhanden', v_balance, new.cost;
    end if;
    insert into public.ledger (couple_id, member_id, delta, reason, source_type, source_id)
    values (new.couple_id, new.requested_by, -new.cost, 'Belohnung eingelöst', 'request', new.id);
  end if;
  return new;
end $$;
create trigger trg_request_decide before update on public.requests
  for each row execute function public.request_decide();

-- ---------------------------------------------------------------- Punkte übertragen
create table public.transfers (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  from_member uuid not null references public.members(user_id) on delete cascade,
  to_member   uuid not null references public.members(user_id) on delete cascade,
  amount      int  not null check (amount > 0),
  message     text,
  status      public.decision not null default 'offen',
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint transfer_two_people check (from_member <> to_member)
);

create or replace function public.transfer_decide() returns trigger language plpgsql as $$
declare v_balance int;
begin
  if new.status = old.status then return new; end if;
  if old.status <> 'offen' then raise exception 'Diese Übertragung ist bereits entschieden'; end if;
  if auth.uid() is distinct from new.to_member then
    raise exception 'Nur die empfangende Person kann annehmen oder ablehnen';
  end if;

  new.decided_at := now();
  if new.status = 'bestaetigt' then
    select coalesce(sum(delta), 0) into v_balance
      from public.ledger where member_id = new.from_member;
    if v_balance < new.amount then
      raise exception 'Zu wenig Punkte für die Übertragung';
    end if;
    insert into public.ledger (couple_id, member_id, delta, reason, source_type, source_id)
    values (new.couple_id, new.from_member, -new.amount, 'Punkte übertragen', 'transfer', new.id),
           (new.couple_id, new.to_member,    new.amount, 'Punkte erhalten',   'transfer', new.id);
  end if;
  return new;
end $$;
create trigger trg_transfer_decide before update on public.transfers
  for each row execute function public.transfer_decide();

-- ---------------------------------------------------------------- Abstimmungen
create type public.proposal_kind as enum ('quest_points', 'new_quest', 'reward_cost', 'new_reward');

create table public.proposals (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  kind       public.proposal_kind not null,
  target_id  uuid,                       -- bei Änderungen: Quest bzw. Belohnung
  old_value  int,
  new_value  int not null check (new_value > 0),
  payload    jsonb not null default '{}'::jsonb,   -- Name, Kategorie bei Neuanlage
  reason     text,
  created_by uuid not null references public.members(user_id) on delete cascade,
  status     public.decision not null default 'offen',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.proposal_votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  member_id   uuid not null references public.members(user_id) on delete cascade,
  answer      boolean not null,
  voted_at    timestamptz not null default now(),
  primary key (proposal_id, member_id)
);

-- Übernommen wird ein Vorschlag erst, wenn BEIDE zugestimmt haben.
-- Ein Nein beendet ihn sofort, der alte Wert gilt weiter.
create or replace function public.proposal_tally() returns trigger language plpgsql as $$
declare p public.proposals; v_yes int; v_members int;
begin
  select * into p from public.proposals where id = new.proposal_id;
  if p.status <> 'offen' then return new; end if;

  select count(*) into v_members from public.members where couple_id = p.couple_id;
  select count(*) into v_yes from public.proposal_votes
    where proposal_id = p.id and answer is true;

  if exists (select 1 from public.proposal_votes
             where proposal_id = p.id and answer is false) then
    update public.proposals set status = 'abgelehnt', decided_at = now() where id = p.id;
    return new;
  end if;

  if v_yes >= v_members and v_members = 2 then
    case p.kind
      when 'quest_points' then
        update public.quests set points = p.new_value where id = p.target_id;
      when 'reward_cost' then
        update public.rewards set cost = p.new_value where id = p.target_id;
      when 'new_quest' then
        insert into public.quests (couple_id, name, category, points)
        values (p.couple_id, p.payload->>'name',
                coalesce(p.payload->>'category', 'Sonstiges'), p.new_value);
      when 'new_reward' then
        insert into public.rewards (couple_id, name, cost)
        values (p.couple_id, p.payload->>'name', p.new_value);
    end case;
    update public.proposals set status = 'bestaetigt', decided_at = now() where id = p.id;
  end if;
  return new;
end $$;
create trigger trg_proposal_tally after insert or update on public.proposal_votes
  for each row execute function public.proposal_tally();

-- ---------------------------------------------------------------- Zugriff: nur das eigene Paar
alter table public.couples        enable row level security;
alter table public.members        enable row level security;
alter table public.quests         enable row level security;
alter table public.rewards        enable row level security;
alter table public.claims         enable row level security;
alter table public.requests       enable row level security;
alter table public.transfers      enable row level security;
alter table public.proposals      enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.ledger         enable row level security;

create policy couple_self on public.couples
  for select using (id = public.current_couple());

create policy members_read on public.members
  for select using (couple_id = public.current_couple());

do $$
declare t text;
begin
  foreach t in array array['quests','rewards','claims','requests','transfers','proposals'] loop
    execute format(
      'create policy %1$s_rw on public.%1$s for all
         using (couple_id = public.current_couple())
         with check (couple_id = public.current_couple())', t);
  end loop;
end $$;

create policy votes_rw on public.proposal_votes
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- Buchungen sind lesbar, aber nie von Hand schreibbar: keine insert/update/delete-Policy.
create policy ledger_read on public.ledger
  for select using (couple_id = public.current_couple());

-- ---------------------------------------------------------------- Startdaten aus der Tabelle
create or replace function public.seed_defaults(p_couple uuid)
returns void language plpgsql as $$
begin
  insert into public.quests (couple_id, name, category, points) values
    (p_couple, 'Staubsaugen ganze Wohnung',            'Wohnen',    10),
    (p_couple, 'Staub wischen alle Räume',             'Wohnen',     1),
    (p_couple, '1 gr. Fenster putzen (beide Seiten)',  'Fenster',   10),
    (p_couple, '1 kl. Fenster putzen (beide Seiten)',  'Fenster',    4),
    (p_couple, '1 großen Raum Boden wischen',          'Wohnen',     3),
    (p_couple, 'Küche reinigen nach Kochen',           'Küche',      3),
    (p_couple, 'Dunstabzugshaube reinigen',            'Küche',      4),
    (p_couple, 'Backofen reinigen + Blech + Rost',     'Küche',      5),
    (p_couple, 'Fliesenspiegel Küche reinigen',        'Küche',      3),
    (p_couple, 'Kühlschrank sauber machen + enteisen', 'Küche',      5),
    (p_couple, 'Spülmaschine ausräumen',               'Küche',      2),
    (p_couple, 'Bad reinigen',                         'Bad',        4),
    (p_couple, 'Gäste-WC reinigen',                    'Bad',        3),
    (p_couple, 'Wäsche aufhängen + zusammenlegen',     'Wohnen',     2),
    (p_couple, 'Betten abziehen / frisch beziehen',    'Wohnen',     3),
    (p_couple, 'Aufräumen Wohnzimmer / Büro',          'Wohnen',     3),
    (p_couple, 'Tisch wischen',                        'Wohnen',     1),
    (p_couple, '1 Monitor reinigen',                   'Wohnen',     1),
    (p_couple, 'Papiermüll entsorgen',                 'Sonstiges',  1),
    (p_couple, 'Restmüll entsorgen',                   'Sonstiges',  1),
    (p_couple, 'Altglas entsorgen (5 Flaschen = 1 Pkt)','Sonstiges', 1),
    (p_couple, 'Arzttermin machen + hingehen',         'Sonstiges',  6);

  insert into public.rewards (couple_id, name, cost) values
    (p_couple, 'Veto-Ausnahmeantrag',          15),
    (p_couple, 'Freizeitaktivität bestimmen',  15),
    (p_couple, 'Massage eine Region',           3),
    (p_couple, 'Eincremen komplett',            4),
    (p_couple, 'Gua Sha Gesicht',               4),
    (p_couple, 'Zopf flechten',                 4),
    (p_couple, 'Film / Serie aussuchen',        3),
    (p_couple, 'Lieferdienst bestimmen',        2),
    (p_couple, 'Brote schmieren abgeben',       4),
    (p_couple, 'B',                             8),
    (p_couple, 'L',                             8);
end $$;

-- Aufruf nach dem Anlegen des Paares:
--   select public.seed_defaults('<couple-id>');
