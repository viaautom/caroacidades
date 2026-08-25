-- V028: Guarda os coeficientes brutos da regressão linear (a, b) do setor
-- PGV, além do texto formatado em `equacao`, para permitir desenhar a reta
-- de tendência sobre o gráfico de dispersão no frontend (item 29 do
-- edital) sem precisar re-parsear a string da equação.
SET search_path TO sigweb, public;

ALTER TABLE setores_pgv
  ADD COLUMN coef_a FLOAT,
  ADD COLUMN coef_b FLOAT;
