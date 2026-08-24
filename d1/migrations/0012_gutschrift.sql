-- Cleanies an den Empfänger statt in den leeren Markt.
--
-- Bisher waren die Cleanies einer eingelösten Belohnung einfach weg: abgebucht
-- bei der Person, die eingelöst hat, und danach nirgends. Für „ich koche heute
-- für dich" ist das falsch herum — wer die Belohnung erbringt, sollte sie auch
-- bekommen können.
--
-- Deshalb kann der Antrag jetzt sagen, wem sie gutgeschrieben werden. Steht
-- hier niemand, bleibt alles wie vorher; die Wahl muss bei jedem Antrag neu
-- getroffen werden, gemerkt wird sie nirgends.

alter table requests add column gutschrift_an text references users(id);
