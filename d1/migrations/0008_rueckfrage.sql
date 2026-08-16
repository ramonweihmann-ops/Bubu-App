-- Rückfragen und der Weg einer Belohnung nach der Zusage.
--
-- Bisher gab es auf eine Meldung oder einen Antrag nur Ja oder Nein. Wenn der
-- Termin nicht passt, ist beides falsch: Ablehnen wirft den Antrag weg, obwohl
-- man ihn eigentlich will. Deshalb die Rückfrage — der Antrag bleibt offen, die
-- Frage hängt daran, und wer ihn gestellt hat, antwortet und schickt ihn erneut.
--
-- Und: eine zugesagte Belohnung ist noch keine erhaltene. Wer sie beantragt hat,
-- bestätigt, dass sie tatsächlich kam. Kam sie nicht, verliert die Person, die
-- zugesagt hat, denselben Betrag — rückholbar, wenn sie innerhalb von drei Tagen
-- doch noch geliefert wird und der Empfänger das bestätigt.

alter table claims add column rueckfrage text;

alter table claims add column rueckfrage_von text;

alter table claims add column rueckfrage_am text;

alter table requests add column rueckfrage text;

alter table requests add column rueckfrage_von text;

alter table requests add column rueckfrage_am text;

alter table requests add column vorschlag_datum text;

-- offen → erhalten | nicht_erhalten → nachgeholt → erhalten
alter table requests add column erfuellt text;

alter table requests add column erfuellt_am text;

alter table requests add column strafe_am text;

alter table requests add column nachhol_von text;

alter table requests add column nachhol_am text;

-- Ausnahme- und Vetoanträge werden nicht „geliefert" — für sie entfällt die
-- Empfangsbestätigung. Alles andere (Massage, Frühstück, Film aussuchen) schon.
alter table rewards add column bestaetigen integer not null default 1;

update rewards set bestaetigen = 0 where name like '%Veto%' or name like '%Ausnahme%';
