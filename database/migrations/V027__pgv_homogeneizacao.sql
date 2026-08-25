-- V027: Suporte à homogeneização de amostras por lote paradigma (item 28
-- do edital). O setor de cálculo passa a guardar os atributos do lote
-- paradigma de referência, e cada amostra passa a guardar seu valor já
-- homogeneizado (usado na regressão em vez do valor bruto).
SET search_path TO sigweb, public;

ALTER TABLE setores_pgv
  ADD COLUMN paradigma_padrao_cub          VARCHAR(50),
  ADD COLUMN paradigma_estado_conservacao  VARCHAR(50),
  ADD COLUMN paradigma_idade_aparente      INT;

ALTER TABLE amostras_pgv
  ADD COLUMN valor_homogeneizado FLOAT;
