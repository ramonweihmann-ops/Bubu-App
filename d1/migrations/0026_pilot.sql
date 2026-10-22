-- Pilot: Einladungen und die Fehlerliste fürs Betriebs-Dashboard.
--
-- Im Pilot kommt nur herein, wer eingeladen ist. Eine Einladung ist ein Code
-- wie HOMI-7K3-PQ8, den der Betrieb anlegt und verschickt. Wer ihn vor der
-- Google-Anmeldung eingibt (oder per Link mitbringt), bekommt ein Konto und
-- darf genau einen Haushalt gründen. Die anderen kommen wie bisher mit dem Code
-- des Haushalts dazu. Ob die Einladung nötig ist, steht in einstellungen
-- (pilot_pflicht, fehlt = ja) und lässt sich im Dashboard umschalten.
--
-- name ist nur für den Betrieb („Familie Weber“) — die Eingeladenen sehen ihn nie.
-- Eingelöst ist eine Einladung, sobald gegruendet_am steht, auch wenn der
-- Haushalt später gelöscht wird.

create table einladungen (
  code             text primary key,
  name             text not null,
  angelegt_am      text not null default (datetime('now')),
  angenommen_von   text references users(id) on delete set null,
  angenommen_am    text,
  haushalt         text references couples(id) on delete set null,
  gegruendet_am    text,
  zurueckgezogen_am text
);

create index einladungen_person_idx on einladungen(angenommen_von);
create index einladungen_haushalt_idx on einladungen(haushalt);

-- Fehler aus App und Server, zusammengefasst nach Quelle, Meldung und Ort.
-- Ohne Inhalte: nur die technische Meldung, wo sie auftrat, wie oft und bei wie
-- vielen Personen. Nach 30 Tagen räumt der Wecker auf.
create table fehler (
  id          text primary key,
  quelle      text not null check (quelle in ('app', 'server')),
  nachricht   text not null,
  ort         text not null default '',
  anzahl      integer not null default 1,
  erstmals    text not null default (datetime('now')),
  zuletzt     text not null default (datetime('now')),
  erledigt_am text
);

create index fehler_zuletzt_idx on fehler(zuletzt);

-- Wer betroffen war — nur um „bei 2 Personen“ zählen zu können.
create table fehler_wer (
  fehler_id text not null references fehler(id) on delete cascade,
  wer       text not null,
  primary key (fehler_id, wer)
);
