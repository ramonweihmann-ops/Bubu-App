-- Vom Paar zum Haushalt.
--
-- Bisher war alles auf genau zwei Personen ausgelegt. Jetzt gibt es einen Typ
-- (WG, Familie, Pärchen, Sonstige), eine geplante Größe und Rollen. Die Tabellen
-- heißen weiterhin „couples" und „couple_id" — sie umzubenennen hieße, jede
-- Fremdschlüsselbeziehung anzufassen, und dafür ist der Gewinn zu klein.
--
-- Bestehende Haushalte behalten alles: Typ „paar", Größe zwei, Einrichtung
-- übersprungen (sie sind ja längst eingerichtet), beide Personen verwalten.
--
-- Räume werden eine eigene Tabelle. Die Kategorie einer Quest zeigt darauf,
-- bleibt aber Text — so bricht keine bestehende Quest, wenn ein Raum verschwindet.

alter table couples add column art text not null default 'paar';

alter table couples add column groesse integer not null default 2;

alter table couples add column erwachsene integer not null default 2;

alter table couples add column kinder integer not null default 0;

alter table couples add column eingerichtet integer not null default 0;

update couples set eingerichtet = 1;

alter table members add column rolle text not null default 'mitglied';

alter table members add column erwachsen integer not null default 1;

update members set rolle = 'verwalter';

alter table users add column bild text;

create table raeume (id text primary key, couple_id text not null references couples(id) on delete cascade, name text not null, sortierung integer not null default 0, aktiv integer not null default 1, created_at text not null default (datetime('now')));

create unique index raeume_name_idx on raeume(couple_id, name);

insert into raeume (id, couple_id, name, sortierung) select lower(hex(randomblob(8))), couple_id, category, 0 from quests where active = 1 group by couple_id, category;

-- Das Startguthaben aus der Reinigungsquest-Tabelle gilt nur für den einen
-- Haushalt, aus dem es stammt. Neue Haushalte fangen bei null an — sonst
-- bekäme jede neue WG die 88 Punkte aus einer fremden Excel geschenkt.

alter table couples add column startguthaben integer not null default 0;

update couples set startguthaben = 1;
