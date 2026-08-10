// Startbestand aus der Reinigungsquest-Tabelle. Wird beim Anlegen eines Paares
// eingesetzt und kann danach jederzeit per Abstimmung geändert werden.

export const QUESTS = [
  { name: "Staubsaugen ganze Wohnung",             kategorie: "Wohnen",    punkte: 10 },
  { name: "Staub wischen alle Räume",              kategorie: "Wohnen",    punkte: 1 },
  { name: "1 gr. Fenster putzen (beide Seiten)",   kategorie: "Fenster",   punkte: 10 },
  { name: "1 kl. Fenster putzen (beide Seiten)",   kategorie: "Fenster",   punkte: 4 },
  { name: "1 großen Raum Boden wischen",           kategorie: "Wohnen",    punkte: 3 },
  { name: "Küche reinigen nach Kochen",            kategorie: "Küche",     punkte: 3 },
  { name: "Dunstabzugshaube reinigen",             kategorie: "Küche",     punkte: 4 },
  { name: "Backofen reinigen + Blech + Rost",      kategorie: "Küche",     punkte: 5 },
  { name: "Fliesenspiegel Küche reinigen",         kategorie: "Küche",     punkte: 3 },
  { name: "Kühlschrank sauber machen + enteisen",  kategorie: "Küche",     punkte: 5 },
  { name: "Spülmaschine ausräumen",                kategorie: "Küche",     punkte: 2 },
  { name: "Bad reinigen",                          kategorie: "Bad",       punkte: 4 },
  { name: "Gäste-WC reinigen",                     kategorie: "Bad",       punkte: 3 },
  { name: "Wäsche aufhängen + zusammenlegen",      kategorie: "Wohnen",    punkte: 2 },
  { name: "Betten abziehen / frisch beziehen",     kategorie: "Wohnen",    punkte: 3 },
  { name: "Aufräumen Wohnzimmer / Büro",           kategorie: "Wohnen",    punkte: 3 },
  { name: "Tisch wischen",                         kategorie: "Wohnen",    punkte: 1 },
  { name: "1 Monitor reinigen",                    kategorie: "Wohnen",    punkte: 1 },
  { name: "Papiermüll entsorgen",                  kategorie: "Sonstiges", punkte: 1 },
  { name: "Restmüll entsorgen",                    kategorie: "Sonstiges", punkte: 1 },
  { name: "Altglas entsorgen (5 Flaschen = 1 Pkt)",kategorie: "Sonstiges", punkte: 1 },
  { name: "Arzttermin machen + hingehen",          kategorie: "Sonstiges", punkte: 6 }
];

// Punktestände aus der Reinigungsquest-Tabelle, Zeile „Punkte übrig".
// Wird einmalig gebucht, sobald das Paar vollständig ist. Wer hier nicht steht,
// startet bei null. Nach der Übernahme kann dieser Block ersatzlos weg.
export const ANFANGSBESTAND = {
  "ramon.weihmann@googlemail.com": 10,
  standard: 88
};

export const BELOHNUNGEN = [
  { name: "Veto-Ausnahmeantrag",         kosten: 15 },
  { name: "Freizeitaktivität bestimmen", kosten: 15 },
  { name: "Massage eine Region",         kosten: 3 },
  { name: "Eincremen komplett",          kosten: 4 },
  { name: "Gua Sha Gesicht",             kosten: 4 },
  { name: "Zopf flechten",               kosten: 4 },
  { name: "Film / Serie aussuchen",      kosten: 3 },
  { name: "Lieferdienst bestimmen",      kosten: 2 },
  { name: "Brote schmieren abgeben",     kosten: 4 },
  { name: "B",                           kosten: 8 },
  { name: "L",                           kosten: 8 }
];
