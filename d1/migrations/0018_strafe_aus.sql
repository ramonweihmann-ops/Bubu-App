-- Gruppenstrafe aus — und die zuletzt gebuchte zurücknehmen.
--
-- Zwei Dinge in einem Schritt, weil sie zusammengehören: die Strafe soll
-- aufhören, und die eine, die gerade noch durchgegangen ist, soll weg.
--
-- Die Mahnung bleibt. Sie kostet nichts, sie erinnert nur — abgeschaltet wird
-- allein die Buchung nach sieben überfälligen Tagen. Genau dafür gibt es in
-- der App den Schalter unter Einstellungen → Haushalt → Gruppenstrafe; diese
-- Migration legt ihn einmal um. Danach gilt wieder, was dort eingestellt ist:
-- wer den Haushalt verwaltet, kann die Strafe jederzeit zurückholen.
--
-- Gesucht wird diesmal über ZWEI Wege, nicht nur über den Namen: über den
-- Haushalt, in dem jemand „Bibi" heißt, UND über den Haushalt, der zuletzt
-- eine Gruppenstrafe kassiert hat. Bei den letzten beiden Korrekturen hing
-- alles am Namen, und ob der wirklich passt, wissen wir bis heute nicht.
-- Trifft einer der beiden Wege, sitzt die Änderung.

update couples set strafe_an = 0 where id in (select m.couple_id from members m join users u on u.id = m.user_id where lower(trim(u.name)) = 'bibi' or lower(trim(u.name)) like 'bibi %') or id = (select l.couple_id from ledger l where l.source_type = 'strafe' and l.reason like 'Gruppenstrafe:%' order by l.created_at desc, l.rowid desc limit 1);

-- Die zuletzt gebuchte Gruppenstrafe zurücknehmen.
--
-- Eine Gruppenstrafe bucht für alle Anwesenden unter derselben Kennung
-- „<quest>:<fällig am>"; über die jüngste davon findet die Abfrage genau diese
-- eine Runde. Kein Haushaltsfilter nötig und keiner erwünscht: gemeint ist die
-- Strafe, die gerade eben gefallen ist, und das ist die jüngste überhaupt.
--
-- Zurückgenommen wird durch eine Gegenbuchung, nicht durch Löschen — der
-- Verlauf soll erzählen, was passiert ist. Der Betrag spiegelt die
-- ursprüngliche Zeile. Wurde dieselbe Runde schon einmal zurückgenommen
-- (Migration 0017), passiert hier nichts mehr.

insert into ledger (id, couple_id, member_id, delta, reason, source_type, source_id) select 'ruecknahme-' || l.id, l.couple_id, l.member_id, -l.delta, replace(l.reason, 'Gruppenstrafe: ', 'Strafe zurückgenommen: '), 'korrektur', 'ruecknahme-' || l.id from ledger l where l.source_type = 'strafe' and l.reason like 'Gruppenstrafe:%' and l.source_id = (select x.source_id from ledger x where x.source_type = 'strafe' and x.reason like 'Gruppenstrafe:%' order by x.created_at desc, x.rowid desc limit 1) and not exists (select 1 from ledger g where g.id = 'ruecknahme-' || l.id);
