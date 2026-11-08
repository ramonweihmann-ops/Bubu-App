-- Buchung anzweifeln, auch bei eingelösten Belohnungen (Ausnahme- und
-- Vetoanträge eingeschlossen).
--
-- Wird eine Einlösung per Abstimmung zurückgesetzt, gilt sie als nie passiert:
-- Alles, was an ihr hängt — die Abbuchung, eine Gutschrift an jemand anderen,
-- eine Strafe oder Nachholung wegen „nicht bekommen“ —, bekommt eine
-- Gegenbuchung. Der Antrag bekommt den Zeitpunkt in „zurueckgesetzt_am“ und gilt
-- nicht mehr als genehmigt; eine offene Zusage verschwindet damit von selbst.

alter table requests add column zurueckgesetzt_am text;

-- Buchungen werden über ihre Quelle nachgeschlagen: beim Buchen („gibt es das
-- schon?“) und beim Zurücksetzen. Ohne Index liest jede dieser Fragen das ganze
-- Buch — mit Index eine Zeile. Hält Homi Point im kostenlosen Rahmen.

create index if not exists ledger_quelle_idx on ledger(source_id);
