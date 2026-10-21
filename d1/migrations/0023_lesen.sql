-- Weniger lesen.
--
-- Im kostenlosen Plan von Cloudflare ist Lesen das knappe Gut: 5 Millionen
-- Zeilen am Tag, gezählt wird jede Zeile, die eine Abfrage anfasst — auch die,
-- die sie nur durchsucht und verwirft. Der Zustand der App wird alle 25 Sekunden
-- geladen, jede gesparte Zeile zählt also oft.
--
-- Ohne diese Verzeichnisse las die Liste der Quests für jede Quest alle
-- Meldungen durch, um die bestätigten zu zählen — bei 27 Quests und 345
-- Meldungen über 9.000 Zeilen pro Abruf. Mit ihnen nur noch die passenden.

-- Bestätigte Meldungen je Quest (Questliste, Events).
create index if not exists claims_quest_idx on claims(quest_id, status);

-- Eingelöste Belohnungen je Belohnung (Belohnungsliste).
create index if not exists requests_belohnung_idx on requests(reward_id, status);

-- Was die Kinder heute geschafft haben: nur die letzten Tage, nicht alles.
create index if not exists claims_entschieden_idx on claims(couple_id, status, decided_at);
