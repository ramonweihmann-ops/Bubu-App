-- Aktionen: Zeiträume mit doppelten Punkten auf Quests oder Rabatt auf Belohnungen.
--
-- Beide sind dieselbe Sache mit umgekehrtem Vorzeichen, deshalb eine Tabelle.
-- „prozent" liest sich in beiden Fällen natürlich: 100 = doppelte Punkte,
-- 25 = ein Viertel günstiger. „kategorie" grenzt auf einen Raum ein; leer heißt alles.
--
-- Angestoßen wird eine Aktion nur gemeinsam — über dieselbe Abstimmung wie
-- Punktwerte. Dafür braucht ein Vorschlag ein Feld für die Einzelheiten, und die
-- Liste erlaubter Arten muss erweitert werden.

create table aktionen (id text primary key, couple_id text not null references couples(id) on delete cascade, art text not null check (art in ('quest_bonus','belohnung_rabatt')), prozent integer not null check (prozent > 0 and prozent <= 400), kategorie text, beginn text not null, ende text not null, created_by text not null references users(id) on delete cascade, created_at text not null default (datetime('now')));

create index aktionen_zeit_idx on aktionen(couple_id, ende);

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
