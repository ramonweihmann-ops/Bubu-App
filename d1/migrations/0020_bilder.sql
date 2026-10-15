-- Bilder für Quests und Belohnungen.
--
-- Eine Quest bekommt ein Symbol und eine Farbe für die Kachel dahinter, eine
-- Belohnung ein Symbol (statt des Herzens) und ein Hintergrundbild. Leer
-- heißt: noch nie gewählt — dann schlägt die App etwas Passendes vor. Wer das
-- Bild einer Belohnung bewusst entfernt, bekommt „ohne", damit der Vorschlag
-- nicht wiederkommt.
--
-- Symbol ist ein Emoji oder „foto:<id>", Hintergrund ein Motiv („motiv:kino")
-- oder „foto:<id>". Eigene Bilder liegen klein gerechnet in der Tabelle
-- bilder und werden einzeln ausgeliefert — sonst reisten sie mit jeder Abfrage
-- des Zustands alle 25 Sekunden mit.

alter table quests add column icon text;

alter table quests add column farbe text;

alter table rewards add column icon text;

alter table rewards add column bild text;

create table bilder (
  id         text primary key,
  couple_id  text not null references couples(id) on delete cascade,
  daten      text not null,
  groesse    integer not null,
  created_by text,
  created_at text not null default (datetime('now'))
);

create index bilder_haushalt_idx on bilder(couple_id);
