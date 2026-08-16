-- Wiederkehrende Aufgaben sind Quests.
--
-- Sie standen bisher in einer eigenen Tabelle. Das hieß: alles, was ihr schon
-- als Quest angelegt habt, müsste man ein zweites Mal eintippen, um es in den
-- Plan zu bekommen. Falsch herum — eine wiederkehrende Aufgabe ist eine Quest
-- mit einem Rhythmus, nicht etwas anderes.
--
-- Deshalb bekommt jede Quest die Felder dafür. „wiederkehrend = 0" heißt: wie
-- bisher, jederzeit meldbar. „wiederkehrend = 1" heißt: mit Fälligkeit, Sperre,
-- Bewerbung und Mahnung. Umstellen geht damit für jede bestehende Quest, ohne
-- irgendetwas neu anzulegen.
--
-- Gemeldet und bestätigt wird alles über dieselben claims wie vorher — die
-- eigene Tabelle dafür entfällt.

alter table quests add column wiederkehrend integer not null default 0;

alter table quests add column tage integer;

alter table quests add column rhythmus text;

alter table quests add column faellig_am text;

alter table quests add column vergabe_runde text;

alter table quests add column dran text;

alter table quests add column zugewiesen text;

alter table quests add column strafe_runde text;

alter table quests add column mahnung_runde text;

insert into quests (id, couple_id, name, category, points, active, created_at, wiederkehrend, tage, rhythmus, faellig_am, vergabe_runde, dran, zugewiesen, strafe_runde, mahnung_runde) select id, couple_id, name, raum, punkte, aktiv, created_at, 1, tage, rhythmus, faellig_am, vergabe_runde, dran, zugewiesen, strafe_runde, mahnung_runde from plan_aufgaben;

insert into claims (id, couple_id, quest_id, claimed_by, quantity, points_each, note, status, decided_by, decided_at, created_at) select id, couple_id, aufgabe_id, member_id, 1, punkte, grund, status, decided_by, decided_at, created_at from plan_erledigungen;

pragma defer_foreign_keys = on;

create table bewerbungen (id text primary key, couple_id text not null references couples(id) on delete cascade, quest_id text not null references quests(id) on delete cascade, member_id text not null references users(id) on delete cascade, runde text not null, status text not null default 'offen' check (status in ('offen','vergeben','abgesagt','abgelehnt')), created_at text not null default (datetime('now')));

insert into bewerbungen (id, couple_id, quest_id, member_id, runde, status, created_at) select id, couple_id, aufgabe_id, member_id, runde, status, created_at from plan_bewerbungen;

create unique index bewerbungen_idx on bewerbungen(quest_id, runde, member_id);

drop table plan_bewerbungen;

drop table plan_erledigungen;

drop table plan_aufgaben;

create index quests_plan_idx on quests(couple_id, wiederkehrend, faellig_am);
