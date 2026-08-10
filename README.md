# Bubu App

Punktekonto für zwei. Aufgaben („Quests“) haben einen **vorher festgelegten** Punktwert.
Wer eine erledigt, meldet sie — gutgeschrieben wird sie erst, wenn **der andere bestätigt**.
Punktwerte ändern sich nie im Alleingang, sondern nur über eine **Abstimmung**, der beide zustimmen.

Grundlage ist die Reinigungsquest-Tabelle (22 Quests, 11 Belohnungen, zwei Konten).

Eigenes Projekt mit eigener Datenbasis — bewusst getrennt von allen anderen Projekten.

- **Mockup:** [`docs/mockup.html`](./docs/mockup.html) — im Browser öffnen, der Prototyp oben ist antippbar.
- **Datenbank:** [`supabase/schema.sql`](./supabase/schema.sql) — Schema, Regeln und Startdaten.

---

## Die drei Regeln

| Regel | Bedeutung |
| --- | --- |
| Preis steht vorher | Beim Melden wird der aktuelle Punktwert eingefroren. Spätere Änderungen wirken nie rückwirkend. |
| Vier Augen | Melden darf jeder, freigeben nur der andere. Ohne Bestätigung keine Punkte. |
| Nur gemeinsam | Punktwert ändern, Quest anlegen, Belohnung ergänzen: nur mit Zustimmung von beiden. Ein Nein lässt alles beim Alten. |

Die zweite Regel ist keine Frage der Oberfläche, sondern der Datenbank: eine Buchung entsteht
ausschließlich durch die Bestätigung des jeweils anderen Mitglieds (siehe Trigger
`trg_claim_confirm` im Schema). Selbstbestätigung ist serverseitig ausgeschlossen.

## Anmeldung

Google Sign-In über Supabase Auth — kein eigenes Passwort, keine Registrierung.
Übernommen werden Name, E-Mail und Profilbild.

Danach das **Pairing**: Der erste erzeugt einen sechsstelligen Code, der zweite gibt ihn ein.
Der Code ist einmal einlösbar und verfällt nach 24 Stunden. Ein Konto kann in genau einem Paar sein.

Einrichtung in Supabase:

1. **Authentication → Providers → Google** aktivieren.
2. In der [Google Cloud Console](https://console.cloud.google.com/) OAuth-Client (Typ *Web*) anlegen.
3. Als Redirect-URI die Callback-Adresse aus Supabase eintragen
   (`https://<projekt>.supabase.co/auth/v1/callback`).
4. Client-ID und Secret in Supabase hinterlegen.

## Strikt getrennt vom Webportal

Die App bekommt eine **eigene Datenbasis**. Nichts wird mit Stage oder Prod des Mietportals geteilt:

| Ebene | Trennung |
| --- | --- |
| Repository | Eigenes GitHub-Repo, eigener Verlauf, eigene Releases. |
| Supabase | **Eigenes Supabase-Projekt** mit eigener Projekt-URL, eigenem anon-Key, eigener Datenbank. Kein zusätzliches Schema in der bestehenden Instanz — dort teilen sich Stage und Prod sonst Rollen, Auth-Nutzer und Storage. |
| Nutzerkonten | Eigene Auth-Instanz. Eine Anmeldung im Mietportal gilt hier nicht und umgekehrt. |
| Umgebungen | Getrennte Projekte für Test und Echtbetrieb, damit Ausprobieren nie echte Punktestände trifft. |
| Schlüssel | Eigene `.env` in diesem Repo. Kein Schlüssel wandert zwischen den Projekten. |
| Kosten | Beide Projekte passen in den kostenlosen Supabase-Rahmen. |

Einrichtung:

```bash
cp .env.example .env      # danach URL und anon-Key des NEUEN Projekts eintragen
```

Schema einspielen: Inhalt von `supabase/schema.sql` im **SQL Editor des neuen Projekts** ausführen.

## Wie die App aufs Handy kommt

Alle drei Wege kommen ohne öffentlichen Store-Eintrag aus.

**Weg 1 — APK verschicken.** Die fertige Installationsdatei per Messenger oder Cloud teilen,
antippen, einmalig „Installation aus dieser Quelle erlauben“ bestätigen. Kein Konto, keine Gebühr.
Updates heißt: neue Datei schicken.

**Weg 2 — Play Console, interne Testspur.** App hochladen, die beiden Mailadressen eintragen,
niemand sonst sieht sie. Updates kommen automatisch. Einmalig 25 US-Dollar für das Entwicklerkonto.

**Weg 3 — Web-App zum Anheften (Empfehlung für zwei Personen).** Die App läuft unter einer privaten
Adresse und wird über „Zum Startbildschirm hinzufügen“ zu einem Symbol wie jede andere App,
inklusive Push. Keine Installationsdatei, kein Store, Updates sofort bei beiden.

Der Wechsel von Weg 3 zu Weg 1 oder 2 ist später jederzeit möglich, ohne die Datenbank anzufassen.

## Figuren und Namen

Fuchs und Wolf sind eigene Vektorzeichnungen und liegen an **einer** Stelle im Mockup
(die `<symbol>`-Blöcke `m-fox`, `m-wolf`, `m-duo` in `docs/mockup.html`). Sie können bleiben oder in einem Zug
getauscht werden. Für einen späteren Verkauf wäre nur der Name „Bubu App“ zu prüfen —
und, falls doch Tenor-GIFs dazukommen, deren Lizenz.
