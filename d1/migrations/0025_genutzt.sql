-- „12× erledigt“ und „3× eingelöst“ mitzählen statt jedes Mal nachzuzählen.
--
-- Die Quest- und die Belohnungsliste zeigen, wie oft etwas schon bestätigt
-- wurde, und sortieren danach. Bisher zählte jeder Abruf dafür alle bestätigten
-- Meldungen und Anträge des Haushalts durch — je länger der Verlauf, desto mehr
-- Zeilen, und das alle paar Minuten. Jetzt führt die Datenbank die Zahl selbst
-- mit: Trigger zählen hoch, wenn etwas bestätigt wird, und wieder herunter, wenn
-- es zurückgeht oder gelöscht wird. Die Zahl entsteht so weiter nur aus den
-- Meldungen; kein Code kann vergessen, sie anzufassen.
--
-- Die Cleanies-Stände bleiben, wie sie sind: nirgends gespeichert, immer aus
-- allen Buchungen berechnet (siehe „Die drei Regeln“ im README).

alter table quests add column genutzt integer not null default 0;

alter table rewards add column genutzt integer not null default 0;

update quests set genutzt = (select count(*) from claims c where c.quest_id = quests.id and c.status = 'bestaetigt');

update rewards set genutzt = (select count(*) from requests r where r.reward_id = rewards.id and r.status = 'bestaetigt');

create trigger genutzt_claims_neu after insert on claims when new.status = 'bestaetigt' begin
  update quests set genutzt = genutzt + 1 where id = new.quest_id;
end;

create trigger genutzt_claims_aendern after update of status, quest_id on claims
  when (old.status = 'bestaetigt') <> (new.status = 'bestaetigt') or old.quest_id is not new.quest_id begin
  update quests set genutzt = genutzt - (old.status = 'bestaetigt') where id = old.quest_id;
  update quests set genutzt = genutzt + (new.status = 'bestaetigt') where id = new.quest_id;
end;

create trigger genutzt_claims_weg after delete on claims when old.status = 'bestaetigt' begin
  update quests set genutzt = genutzt - 1 where id = old.quest_id;
end;

create trigger genutzt_requests_neu after insert on requests when new.status = 'bestaetigt' begin
  update rewards set genutzt = genutzt + 1 where id = new.reward_id;
end;

create trigger genutzt_requests_aendern after update of status, reward_id on requests
  when (old.status = 'bestaetigt') <> (new.status = 'bestaetigt') or old.reward_id is not new.reward_id begin
  update rewards set genutzt = genutzt - (old.status = 'bestaetigt') where id = old.reward_id;
  update rewards set genutzt = genutzt + (new.status = 'bestaetigt') where id = new.reward_id;
end;

create trigger genutzt_requests_weg after delete on requests when old.status = 'bestaetigt' begin
  update rewards set genutzt = genutzt - 1 where id = old.reward_id;
end;
