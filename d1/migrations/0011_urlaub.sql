-- Urlaubsmodus.
--
-- Zwei Dinge, die beide „Urlaub" heißen und trotzdem verschieden sind.
--
-- „person": eine Person ist weg, der Haushalt läuft weiter. Ihre Fälligkeiten
-- bleiben stehen, aber sie bekommt keine Mahnung, zahlt keine Gruppenstrafe mit
-- und wird bei der Vergabe übersprungen. Der Plan wird nicht angefasst.
--
-- „haushalt": alle sind weg. Jede Fälligkeit im Plan rückt einmalig um die
-- Urlaubstage nach hinten; wie viele es waren, steht in „verschoben", damit
-- später nachvollziehbar bleibt, warum ein Datum gesprungen ist. Solange der
-- Urlaub läuft, mahnt und bestraft nichts.
--
-- Beides beschließt der Haushalt gemeinsam — deshalb kennen die Vorschläge
-- jetzt zwei weitere Arten.

create table urlaube (id text primary key, couple_id text not null references couples(id) on delete cascade, art text not null check (art in ('person','haushalt')), member_id text references users(id) on delete cascade, von text not null, bis text not null, grund text, verschoben integer, beendet_am text, created_by text not null references users(id) on delete cascade, created_at text not null default (datetime('now')), check (art = 'haushalt' or member_id is not null));

create index urlaube_lauf_idx on urlaube(couple_id, bis);

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
