-- Testkauf für Plus im Pilot.
--
-- Im Pilot wird nichts berechnet. Wer Plus will, geht den Kauf trotzdem durch:
-- Plan wählen (Monat, Jahr, für immer), zu den späteren Preisen, „Kaufen“.
-- Abgebucht wird nichts; Plus ist danach an und bleibt als Dankeschön.
-- Gespeichert wird, welcher Plan es war, zu welchem Preis, wer gekauft hat und
-- — freiwillig — ob man es auch bezahlt hätte. Wer „Jetzt nicht“ wählt, kann
-- freiwillig sagen, warum.
--
-- Neue Haushalte aus dem Pilot (gegründet mit einer Einladung) testen Plus 14
-- Tage ab der Gründung; danach pausiert Plus bis zum Testkauf. Das setzt der
-- Worker beim Gründen. Haushalte von vor dem Pilot behalten Plus (plus = 1).

create table testkaeufe (
  id         text primary key,
  couple_id  text not null references couples(id) on delete cascade,
  wer        text references users(id) on delete set null,
  plan       text not null check (plan in ('monat', 'jahr', 'immer')),
  preis_cent integer not null check (preis_cent > 0),
  ehrlich    text check (ehrlich in ('ja', 'vielleicht', 'nein')),
  created_at text not null default (datetime('now'))
);

create index testkaeufe_haushalt_idx on testkaeufe(couple_id);

create table plus_absagen (
  id         text primary key,
  couple_id  text not null references couples(id) on delete cascade,
  wer        text references users(id) on delete set null,
  gruende    text not null default '[]',
  created_at text not null default (datetime('now'))
);

create index plus_absagen_haushalt_idx on plus_absagen(couple_id, wer);
