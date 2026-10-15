-- Das Wochenziel: wie viele Cleanies der Haushalt zusammen in einer Woche
-- schaffen will. Gemeinsam, nicht gegeneinander — es gibt keine Rangliste
-- dazu, nur einen Balken auf der Startseite.
--
-- Leer heißt: noch keins eingetragen. Dann sagt die Startseite genau das,
-- statt sich eine Zahl auszudenken. Eintragen kann nur, wer verwaltet.

alter table couples add column wochenziel integer;
