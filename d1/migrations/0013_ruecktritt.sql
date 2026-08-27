-- Von einer Aufgabe zurücktreten.
--
-- Eine übernommene Aufgabe ist eine Zusage — aber manchmal geht es nicht.
-- Bisher blieb dann nur, sie liegen zu lassen, bis die Mahnung kommt und
-- irgendwann die Gruppenstrafe. Besser ist, es zu sagen: mit Grund, und die
-- anderen entscheiden.
--
-- Der Rücktritt läuft über dieselben Vorschläge wie alles andere, zählt aber
-- anders: es reicht eine Mehrheit, und ein einzelnes Nein beendet ihn nicht.
-- Sonst könnte eine Person jemanden zwingen, krank zu putzen.
--
-- Wer ablehnt, darf sagen warum. Deshalb bekommt auch die Stimme ein Feld.

alter table proposal_votes add column grund text;

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt','ruecktritt')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
