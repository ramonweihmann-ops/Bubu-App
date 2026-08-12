-- Selbst gewählter Anzeigename.
--
-- Bisher hat jede Anmeldung den Namen aus dem Google-Konto übernommen. Wer ihn
-- in den Einstellungen ändert, würde ihn beim nächsten Anmelden wieder verlieren.
-- Die Marke merkt sich deshalb, dass der Name von Hand gesetzt wurde — dann
-- lässt die Anmeldung ihn in Ruhe. E-Mail und Profilbild kommen weiter von Google.

alter table users add column name_gesetzt integer not null default 0;
