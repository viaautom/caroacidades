-- V024: Vincula polos valorizantes do PGV ao setor de cálculo ao qual
-- pertencem (item 31 do edital — cálculo automático de distância da face
-- de quadra ao polo exige saber qual polo atende qual setor).
SET search_path TO sigweb, public;

ALTER TABLE polos_pgv ADD COLUMN setor_id UUID REFERENCES setores_pgv(id);

CREATE INDEX idx_polos_pgv_setor ON polos_pgv (setor_id);
