-- Events: Regeln auf Zeit, die der Haushalt selbst schreibt.
--
-- Cleanies sammeln sich an und bleiben liegen. Die Belohnungsliste ist fest,
-- sie gilt immer und für alle gleich. Ein Event ist das Gegenstück: „1 Stunde
-- Zockzeit für 20 Cleanies, dieses Wochenende, höchstens dreimal, nur für
-- Mika". Was drinsteht, gibt niemand vor — „titel" ist ein freies Textfeld.
--
-- Der Kniff: ein freigegebenes Event ist keine neue Mechanik. Es hängt an
-- einer ganz normalen Belohnung (Richtung „ausgeben") oder an einer ganz
-- normalen Quest (Richtung „verdienen") und schaltet sie im Fenster scharf.
-- Damit funktionieren Antrag, Freigabe, Empfangsbestätigung, Verlauf,
-- Statistik und Push vom ersten Tag an, ohne dass davon etwas doppelt
-- gebaut werden müsste.
--
-- „fuer" ist eine JSON-Liste von Kennungen; leer heißt: für alle. Die beiden
-- Deckel sind freiwillig — leer heißt: ohne Grenze, dann bremst nur das Konto.
-- „von"/„bis" sind das Fenster, das gerade gilt; bei einem Dauerevent rücken
-- sie weiter, sobald eines vorbei ist.

create table events (id text primary key, couple_id text not null references couples(id) on delete cascade, richtung text not null check (richtung in ('ausgeben','verdienen')), titel text not null, beschreibung text, cleanies integer not null check (cleanies > 0), pro_person integer, gesamt integer, fuer text, von text not null, bis text not null, rhythmus text, starttag integer, laenge integer not null check (laenge > 0), ziel_id text, aktiv integer not null default 1, beendet_am text, created_by text not null references users(id) on delete cascade, created_at text not null default (datetime('now')));

create index events_couple_idx on events(couple_id, aktiv);

-- Die Gegenrichtung: von der Belohnung beziehungsweise Quest zurück zum Event.
-- Ohne sie wüsste die Liste nicht, dass ein Eintrag eine Uhr hat.

alter table rewards add column event_id text;

alter table quests add column event_id text;

create index rewards_event_idx on rewards(event_id);

create index quests_event_idx on quests(event_id);

pragma defer_foreign_keys = on;

create table proposals_neu (id text primary key, couple_id text not null references couples(id) on delete cascade, kind text not null check (kind in ('quest_points','new_quest','reward_cost','new_reward','delete_quest','delete_reward','neue_aktion','neue_aufgabe','aufgabe_aendern','delete_aufgabe','urlaub_person','urlaub_haushalt','ruecktritt','neues_event','event_aendern','event_aus')), target_id text, old_value integer, new_value integer not null, name text, category text, reason text, payload text, created_by text not null references users(id) on delete cascade, status text not null default 'offen' check (status in ('offen','bestaetigt','abgelehnt')), decided_at text, created_at text not null default (datetime('now')));

insert into proposals_neu (id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at) select id, couple_id, kind, target_id, old_value, new_value, name, category, reason, payload, created_by, status, decided_at, created_at from proposals;

drop table proposals;

alter table proposals_neu rename to proposals;

create index proposals_offen_idx on proposals(couple_id, status);
