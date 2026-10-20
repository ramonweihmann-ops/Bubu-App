-- Der Fair-Bericht: wer macht wie viel, über Wochen und Monate.
--
-- Gerechnet wird aus dem, was es schon gibt — Buchungen, Meldungen,
-- Abstimmungen, Anträge. Neu ist nur, was der Haushalt fair nennt, ob er
-- Plus hat, und wer eine Runde für jemand anderen übernommen hat.

-- Was fair heißt, stimmen zwei Erwachsene gemeinsam ab: der Anteil der einen
-- Person in Prozent, die andere trägt den Rest. Leer heißt 50 : 50.

alter table couples add column fair_soll integer;

alter table couples add column fair_soll_von text;

-- Plus: bis es sich kaufen lässt, haben es alle. Mit dem Bezahlen wird der
-- Standard 0. Wer es nicht hat, kann es einmal 14 Tage testen.

alter table couples add column plus integer not null default 1;

alter table couples add column plus_test_bis text;

-- Wem die Runde gehörte, wenn jemand anderes sie übernommen hat. Bisher stand
-- das nur in der Notiz; ältere Meldungen erkennt der Bericht weiter daran.

alter table claims add column uebernommen_von text;

-- Abstimmungen kennen jetzt auch das gemeinsame Soll.

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt','ruecktritt','neues_event','event_aendern','event_aus','kurs','fair_soll')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
