-- Wiederkehrende Aufgaben: der Haushaltsplan.
--
-- Getrennt von den Quests, die unangetastet bleiben. Eine Aufgabe hat einen
-- Rhythmus in Tagen, ein Fälligkeitsdatum und einen Punktwert. Nach dem
-- Erledigen springt das Datum um genau diesen Rhythmus nach vorn — daraus
-- ergibt sich die Sperre von selbst: vor dem Fälligkeitsdatum geht nichts.
--
-- Die Vergabe steht in derselben Zeile: „dran" ist, wer gerade entscheiden
-- darf, „zugewiesen" ist, wer angenommen hat. „runde" ist immer das
-- Fälligkeitsdatum, für das das gilt — so kann nichts aus einer alten Runde
-- in die nächste durchschlagen.

create table plan_aufgaben (id text primary key, couple_id text not null references couples(id) on delete cascade, name text not null, raum text not null default 'Sonstiges', punkte integer not null check (punkte > 0), tage integer not null check (tage > 0), rhythmus text not null, faellig_am text not null, aktiv integer not null default 1, vergabe_runde text, dran text references users(id) on delete set null, zugewiesen text references users(id) on delete set null, strafe_runde text, mahnung_runde text, created_at text not null default (datetime('now')));

create index plan_aufgaben_idx on plan_aufgaben(couple_id, aktiv, faellig_am);

create table plan_erledigungen (id text primary key, aufgabe_id text not null references plan_aufgaben(id) on delete cascade, couple_id text not null references couples(id) on delete cascade, member_id text not null references users(id) on delete cascade, punkte integer not null, grund text, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_by text references users(id) on delete set null, decided_at text, created_at text not null default (datetime('now')), check (decided_by is null or decided_by <> member_id));

create index plan_erledigungen_idx on plan_erledigungen(couple_id, status);

create index plan_erledigungen_zaehler on plan_erledigungen(aufgabe_id, status, created_at);

create table plan_bewerbungen (id text primary key, aufgabe_id text not null references plan_aufgaben(id) on delete cascade, couple_id text not null references couples(id) on delete cascade, member_id text not null references users(id) on delete cascade, runde text not null, status text not null default 'offen' check (status in ('offen','vergeben','abgesagt','abgelehnt')), created_at text not null default (datetime('now')));

create unique index plan_bewerbungen_idx on plan_bewerbungen(aufgabe_id, runde, member_id);

-- Die Gruppenstrafe nach sieben überfälligen Tagen lässt sich abschalten.
alter table couples add column strafe_an integer not null default 1;

-- Vorschläge kennen jetzt auch die drei Arten rund um den Plan.
pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
