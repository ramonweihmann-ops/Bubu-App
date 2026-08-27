-- Jubel nach Cleanies-Phasen.
--
-- Bisher gab es ein Konfetti für alles: die Drei-Cleanies-Quest jubelte genauso
-- wie die Zehner. Jetzt in drei Stufen — leise, mittel, groß —, und das
-- Feuerwerk gehört in die oberste. Sonst nutzt es sich ab.
--
-- Gespeichert werden nur die beiden Grenzen; die dritte Stufe ist nach oben
-- offen, damit auch eine Quest über 99 Cleanies irgendwo landet. Verstellen
-- darf sie die Verwaltung allein — es ist eine Anzeigesache, keine
-- Cleanies-Sache, und braucht deshalb keine Abstimmung.
--
-- Eigene GIFs kommen zu den eingebauten dazu, sie ersetzen sie nicht: sonst
-- wäre nach dem ersten Hochladen wieder immer dasselbe zu sehen.

alter table couples add column phase_leise integer not null default 3;

alter table couples add column phase_mittel integer not null default 6;

create table jubel_gifs (id text primary key, couple_id text not null references couples(id) on delete cascade, phase text not null check (phase in ('leise','mittel','gross')), name text not null, daten text not null, groesse integer not null, created_by text not null references users(id) on delete cascade, created_at text not null default (datetime('now')));

create index jubel_gifs_idx on jubel_gifs(couple_id, phase);
