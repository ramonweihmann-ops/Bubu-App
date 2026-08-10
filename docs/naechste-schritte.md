# Nächste Schritte

Drei Ideen aus dem Gespräch, noch nicht gebaut. Reihenfolge offen.

---

## 1. Dashboard mit Verlauf und Prognose ✓ gebaut

**Was:** Sehen, wie viele Punkte an welchem Tag zusammengekommen sind, dazu eine Hochrechnung
auf die Woche und den Monat — damit man ein Ziel vor Augen hat.

**Aufbau:**

- Balken je Tag der letzten vier Wochen, beide Personen nebeneinander
- **Wochenprognose:** bisheriger Schnitt pro Tag × verbleibende Tage + bereits Erreichtes
- **Monatsprognose:** dasselbe auf den Monat, dazu der Vormonat als blasse Linie zum Vergleich
- Kleine Kennzahlen: bester Tag, aktuelle Serie, Punkte bis zur nächsten leistbaren Belohnung

**Datenlage:** Alles schon vorhanden — das Konto rechnet ohnehin aus jeder einzelnen Buchung.
Es braucht nur eine Abfrage, die nach Tag gruppiert, und einen zweiten Blick auf `ledger`.

**Entschieden:** Hochgerechnet wird aus dem Schnitt der **letzten sieben Tage** — nicht aus dem
gesamten Verlauf. Das reagiert auf eine gute oder faule Woche, statt sie in einem Mittel über
Monate verschwinden zu lassen, und ist in einem Satz erklärbar.

**Gezählt wird nur, was durch bestätigte Quests hereinkam.** Übertragungen, Einlösungen und der
Anfangsbestand aus der Tabelle sind Bewegungen, kein Verdienst — sonst stünde am ersten Tag ein
Balken von 88 und alles daneben verschwände.

---

## 2. Rabatte auf Belohnungen ✓ gebaut

**Was:** Zeiträume, in denen Belohnungen günstiger sind. Ein Rabatttag oder eine Rabattwoche
kann von jedem eingeworfen werden — gelten tut sie erst, wenn beide zustimmen.

**Aufbau:**

- Neue Tabelle `aktionen`: Art, Faktor, Beginn, Ende, Umfang (alles oder ein Eintrag)
- Anlegen läuft über dieselbe Abstimmung wie Punktwerte — ein Vorschlag mit Beginn, Ende und Höhe
- Der Preis wird **beim Stellen des Antrags** eingefroren, wie schon heute die Kosten.
  Wer im Rabatt beantragt, behält den Rabattpreis, auch wenn erst danach entschieden wird.
- In der Liste sichtbar: durchgestrichener alter Preis, daneben der neue, dazu die Restlaufzeit

**Entschieden:** Prozent, weil ein fester Abzug bei Belohnungen zwischen 2 und 15 Punkten
sehr ungleich wirkt. Höchstens 90 %, darüber wäre es geschenkt.

---

## 3. Doppelte Punkte auf Quests ✓ gebaut

**Was:** Zeiträume, in denen Quests mehr bringen. Wie beim Rabatt nur gemeinsam zu starten.

**Aufbau:** Dieselbe Tabelle `aktionen`, nur auf Quests statt Belohnungen. Der Faktor greift
beim **Melden** — der Wert friert wie gewohnt ein. Wer während der Aktion meldet, behält den
doppelten Wert, auch wenn erst danach bestätigt wird. Wer vorher gemeldet hat, bekommt nichts
nachträglich.

**Warum das wichtig ist:** Sonst entstünde ein Anreiz, Meldungen zurückzuhalten und auf eine
Aktion zu warten — oder umgekehrt Streit darüber, was noch „reinzählt“. Mit dem Einfrieren
zum Zeitpunkt der Meldung ist die Regel in einem Satz erklärbar und nicht angreifbar.

**Entschieden:** Eine Aktion kann auf eine Kategorie begrenzt werden — „diese Woche doppelte
Punkte auf alles in der Küche“. Ohne Auswahl gilt sie für alle Quests.

---

## Gemeinsamer Unterbau

Rabatt und Doppelpunkte sind dieselbe Sache mit unterschiedlichem Vorzeichen. Beide brauchen:

- eine Tabelle `aktionen` mit Zeitraum, Faktor und Umfang
- zwei neue Vorschlagsarten in der bestehenden Abstimmung
- eine Anzeige, die laufende und geplante Aktionen zeigt
- den Faktor an genau zwei Stellen: beim Melden einer Quest und beim Stellen eines Antrags

Damit bleibt die Grundregel unangetastet: **Der Preis steht fest, bevor gearbeitet wird.**
