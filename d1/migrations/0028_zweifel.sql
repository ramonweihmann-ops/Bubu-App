-- Buchung anzweifeln: eine bestätigte Quest im Verlauf zurücksetzen lassen.
--
-- Wer eine Buchung anzweifelt, stellt sie zur Abstimmung (Art „zweifel“). Es
-- entscheidet eine Mehrheit der Stimmberechtigten, wie beim Rücktritt; wer
-- anzweifelt, zählt als Ja. Wird zurückgesetzt, bleibt nichts gelöscht: eine
-- Gegenbuchung „Zurückgesetzt: …“ kommt in den Verlauf, die Meldung bekommt den
-- Zeitpunkt in „zurueckgesetzt_am“ und gilt nicht mehr als bestätigt. So zählt
-- sie weder im Fair-Bericht noch in der Wochenkachel oder im Haushaltsplan.

alter table claims add column zurueckgesetzt_am text;

-- Abstimmungen kennen jetzt auch den Zweifel an einer Buchung. Dafür muss die
-- Tabelle neu gebaut werden — SQLite ändert eine Prüfung nicht nachträglich.

-- Die Stimmen-Trigger schauen in proposals nach dem Haushalt. Solange die
-- Tabelle umgebaut wird, gibt es sie kurz nicht — dann lässt SQLite die
-- Umbenennung nicht zu. Also vorher weg und danach wieder an.

drop trigger if exists stand_stimmen_neu;

drop trigger if exists stand_stimmen_aendern;

drop trigger if exists stand_stimmen_weg;

-- Die Stimmen hängen mit „on delete cascade“ an den Vorschlägen. Das Löschen
-- der alten Tabelle nähme sie mit — offene Abstimmungen verlören ihre Stimmen.
-- Deshalb vorher beiseitelegen und nach dem Umbau zurückspielen.

create table stimmen_sicher as select proposal_id, member_id, answer, voted_at, grund from proposal_votes;

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt','ruecktritt','neues_event','event_aendern','event_aus','kurs','fair_soll','zweifel')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);

insert or ignore into proposal_votes (proposal_id, member_id, answer, voted_at, grund)
  select proposal_id, member_id, answer, voted_at, grund from stimmen_sicher
   where proposal_id in (select id from proposals);

drop table stimmen_sicher;

-- Mit der alten Tabelle sind auch ihre Trigger weg (d1/migrations/0024_stand.sql).

create trigger stand_proposals_neu after insert on proposals begin
  update couples set stand = stand + 1 where id = new.couple_id;
end;

create trigger stand_proposals_aendern after update on proposals begin
  update couples set stand = stand + 1 where id in (old.couple_id, new.couple_id);
end;

create trigger stand_proposals_weg after delete on proposals begin
  update couples set stand = stand + 1 where id = old.couple_id;
end;

-- Stimmen hängen über den Vorschlag am Haushalt.

create trigger stand_stimmen_neu after insert on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = new.proposal_id);
end;

create trigger stand_stimmen_aendern after update on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = new.proposal_id);
end;

create trigger stand_stimmen_weg after delete on proposal_votes begin
  update couples set stand = stand + 1 where id = (select couple_id from proposals where id = old.proposal_id);
end;
