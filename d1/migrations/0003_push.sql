-- Benachrichtigungen und der Belohnungsmoment auf dem anderen Gerät.
--
-- „ereignisse" merkt sich, was eine Person noch nicht gesehen hat. Beim
-- nächsten Öffnen zeigt die App es als Vollbild — unabhängig davon, ob die
-- Push-Nachricht angekommen ist. „einstellungen" hält das VAPID-Schlüsselpaar,
-- das sich beim ersten Versand selbst erzeugt.

create table ereignisse (id text primary key, couple_id text not null references couples(id) on delete cascade, user_id text not null references users(id) on delete cascade, art text not null, titel text not null, text text, punkte integer, gelesen integer not null default 0, created_at text not null default (datetime('now')));

create index ereignisse_offen_idx on ereignisse(user_id, gelesen);

create table einstellungen (schluessel text primary key, wert text not null);
