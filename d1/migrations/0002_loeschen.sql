-- Löschen von Quests und Belohnungen als Abstimmung.
-- Gelöscht wird nie hart: active = 0 lässt Verlauf und Buchungen unangetastet.
-- Dafür muss die Liste erlaubter Vorschlagsarten erweitert werden; SQLite kann
-- ein CHECK nicht ändern, also wird die Tabelle einmal neu aufgebaut.

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
