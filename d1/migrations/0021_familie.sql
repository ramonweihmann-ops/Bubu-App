-- Der Familienmodus: Kinder machen mit, auch ohne eigenes Handy.
--
-- Ein Kind ist ein Mitglied wie jedes andere, nur ohne Google-Konto: ein
-- Vorname und ein Tier, keine E-Mail, kein Foto. Die Stufe sagt, wie es
-- mitmacht:
--   ohne    ohne Handy — die Eltern tragen ein, die Kinderansicht läuft auf
--           ihrem Handy oder dem Familien-Tablet
--   geraet  eigenes Gerät, angemeldet über einen Code statt über Google
--   gross   Jugendliche mit eigenem Google-Konto und der normalen App
-- Erwachsene haben keine Stufe.
--
-- Kinder bestätigen nie Kinder, und abstimmen dürfen nur Erwachsene und
-- Jugendliche. Die Regeln stehen in worker/familie.js.

alter table members add column stufe text;

alter table members add column tier text;

alter table members add column ansicht text not null default 'glas';

alter table members add column wunsch text;

alter table members add column taschengeld integer not null default 0;

alter table members add column einwilligung_von text;

alter table members add column einwilligung_am text;

-- Für wen eine Quest oder Belohnung gedacht ist. Quests gelten erst einmal für
-- alle, die Belohnungen von heute sind Sachen für Erwachsene.

alter table quests add column fuer text not null default 'alle';

alter table rewards add column fuer text not null default 'erwachsene';

-- Taschengeld: Cent je Cleanie. Die Eltern-PIN schließt die Kinderansicht auf
-- dem Handy der Eltern — gespeichert wird nur ihr Hash.

alter table couples add column kurs integer not null default 10;

alter table couples add column eltern_pin text;

-- Der Code, mit dem sich das Gerät eines Kindes anmeldet. Er gilt zehn Minuten
-- und nur einmal; auch hier steht nur der Hash.

create table kindcodes (code_hash text primary key, user_id text not null references users(id) on delete cascade, couple_id text not null references couples(id) on delete cascade, created_by text, expires_at text not null, created_at text not null default (datetime('now')));

create index kindcodes_kind_idx on kindcodes(user_id);

-- Den Kurs ändern die Erwachsenen gemeinsam, wie einen Cleanies-Wert.

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt','ruecktritt','neues_event','event_aendern','event_aus','kurs')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
