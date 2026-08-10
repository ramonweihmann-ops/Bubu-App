-- ============================================================================
--  Startdaten aus der Reinigungsquest-Tabelle: 22 Quests, 11 Belohnungen.
--
--  Vor dem Einspielen COUPLE_ID durch die ID des angelegten Paares ersetzen.
--  Die App macht das beim Pairing von selbst; diese Datei ist für den Fall,
--  dass die Liste von Hand nachgezogen werden soll.
--
--  npx wrangler d1 execute bubu --remote --file=d1/seed.sql
-- ============================================================================

insert into quests (id, couple_id, name, category, points) values
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Staubsaugen ganze Wohnung',             'Wohnen',    10),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Staub wischen alle Räume',              'Wohnen',     1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', '1 gr. Fenster putzen (beide Seiten)',   'Fenster',   10),
  (lower(hex(randomblob(16))), 'COUPLE_ID', '1 kl. Fenster putzen (beide Seiten)',   'Fenster',    4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', '1 großen Raum Boden wischen',           'Wohnen',     3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Küche reinigen nach Kochen',            'Küche',      3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Dunstabzugshaube reinigen',             'Küche',      4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Backofen reinigen + Blech + Rost',      'Küche',      5),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Fliesenspiegel Küche reinigen',         'Küche',      3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Kühlschrank sauber machen + enteisen',  'Küche',      5),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Spülmaschine ausräumen',                'Küche',      2),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Bad reinigen',                          'Bad',        4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Gäste-WC reinigen',                     'Bad',        3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Wäsche aufhängen + zusammenlegen',      'Wohnen',     2),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Betten abziehen / frisch beziehen',     'Wohnen',     3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Aufräumen Wohnzimmer / Büro',           'Wohnen',     3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Tisch wischen',                         'Wohnen',     1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', '1 Monitor reinigen',                    'Wohnen',     1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Papiermüll entsorgen',                  'Sonstiges',  1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Restmüll entsorgen',                    'Sonstiges',  1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Altglas entsorgen (5 Flaschen = 1 Pkt)','Sonstiges',  1),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Arzttermin machen + hingehen',          'Sonstiges',  6);

insert into rewards (id, couple_id, name, cost) values
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Veto-Ausnahmeantrag',         15),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Freizeitaktivität bestimmen', 15),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Massage eine Region',          3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Eincremen komplett',           4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Gua Sha Gesicht',              4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Zopf flechten',                4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Film / Serie aussuchen',       3),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Lieferdienst bestimmen',       2),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'Brote schmieren abgeben',      4),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'B',                            8),
  (lower(hex(randomblob(16))), 'COUPLE_ID', 'L',                            8);
