-- Eine Anfrage zurücknehmen — und die Benachrichtigung mit ihr.
--
-- Wer etwas meldet oder beantragt, konnte es bisher nicht mehr anfassen. Ein
-- Tippfehler, ein falscher Termin, ein Antrag, der sich erledigt hat: alles
-- blieb stehen, bis jemand anderes darüber entschied. Solange nichts entschieden
-- ist, gehört die Anfrage aber noch der Person, die sie gestellt hat.
--
-- Zurücknehmen heißt: sie war nie da. Also verschwindet auch die Nachricht beim
-- Empfänger. Dafür braucht ein Ereignis eine Spur zu dem, was es ausgelöst hat —
-- bisher stand da nur Text, und Text lässt sich nicht zuverlässig wiederfinden.

alter table ereignisse add column quelle_id text;

create index ereignisse_quelle_idx on ereignisse(quelle_id);
