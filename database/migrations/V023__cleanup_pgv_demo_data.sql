-- V023: Remove retroativamente os dados fictícios de PoC do módulo PGV
-- (setor "Centro Tupanciretã (PoC)", polo "Praça Pinheiro Machado" e faces
-- de quadra em grade) inseridos por V018 em bancos onde essa migração já
-- rodou antes da correção. Idempotente: não faz nada se os dados já
-- tiverem sido removidos ou nunca tiverem existido.
SET search_path TO sigweb, public;

DELETE FROM faces_quadra
WHERE setor_pgv_id IN (
  SELECT id FROM setores_pgv WHERE nome = 'Centro Tupanciretã (PoC)'
);

DELETE FROM setores_pgv WHERE nome = 'Centro Tupanciretã (PoC)';

DELETE FROM polos_pgv WHERE nome = 'Praça Pinheiro Machado';
