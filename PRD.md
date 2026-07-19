# PRD SIGWEB Tupanciretã

> **Nota de Arquitetura (Julho/2026):** Este projeto migrou integralmente do Google Cloud Platform (GCP) e Firebase para **Supabase (Self-Hosted)** e infraestrutura própria gerenciada via **Dokploy**. Todas as menções a Firebase Auth, Firebase Storage, FCM, Firebase Hosting e Cloud Run neste documento devem ser interpretadas como as respectivas contrapartes no ecossistema Supabase/Dokploy.

## Product Requirements Document v2.0
> Baseado no Pregão Eletrônico nº 28/2026, Processo 903/2026
> Contratante: Município de Tupanciretã – RS
> Fornecedor: Caroá Cidades Inteligentes
> Data: 2026-06-06

---

## 1. Visão Geral

O SIGWEB é um Sistema de Informações Geográficas (SIG) 100% web para gestão territorial do Município de Tupanciretã. Integra cadastro imobiliário, controle urbano, iluminação pública, arborização, serviços ao cidadão e planejamento fiscal em uma plataforma unificada, acessível por navegador sem instalação de software.

**URL produção:** `https://caroacidades.web.app`  
**API:** `https://sigweb-api-dev-357570346826.us-east1.run.app`  
**GCP Project:** `caroacidadesinteligentes`  
**Firebase:** `caroacidades`

---

## 2. Objetivos do Produto

| Objetivo | Métrica | Prazo |
|----------|---------|-------|
| Atingir ≥95% dos 234 requisitos do edital | Score BACKLOG.md ≥ 222/234 | Prova de Conceito |
| Implantação completa e operacional | 100% dos módulos em produção | 120 dias após contrato |
| Primeiro envio ao SINTER | Aceite pelo sistema nacional | 31/12/2026 |
| Performance de mapa com 10.000+ parcelas | Render < 500ms | Antes da implantação |

---

## 3. Stack Tecnológica

### Frontend
- React 18 + TypeScript + Vite
- Leaflet 1.9.4 + leaflet.vectorgrid 1.3.0 + leaflet-geoman-free
- Zustand (estado global) + React Query (server state)
- Firebase Auth (autenticação)
- Firebase Hosting (deploy)

### Backend
- Fastify + TypeScript
- PostgreSQL 15 + PostGIS 3.x (Cloud SQL)
- pg-tileserv (MVT tiles)
- Firebase Admin SDK (verificação de tokens)
- Cloud Run (serverless deploy)

### Infraestrutura
- Google Cloud Platform (`caroacidadesinteligentes`)
- Cloud Build (CI/CD)
- Cloud Storage (arquivos, tiles 3D)
- Secret Manager (credenciais)
- Terraform (IaC)

### Apps Móveis
- Expo (React Native) — Android e iOS
- SQLite (offline) + sync com API REST

---

## 4. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                         USUÁRIOS                             │
│  Browser (Web App)    App Android    App iOS                │
└──────────────┬─────────────┬──────────────┬────────────────┘
               │             │              │
         Firebase Auth ──────┴──────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  Firebase Hosting          Cloud Run: sigweb-api-dev         │
│  caroacidades.web.app  ──► API Fastify (porta 3001)         │
│  React + Vite              Auth middleware (JWT)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────▼────────────────────┐
          │  Cloud SQL PostgreSQL + PostGIS  │
          │  sigweb-dev (us-east1)          │
          │                                  │
          │  + pg_tileserv (MVT tiles)       │
          │    sigweb.parcelas/{z}/{x}/{y}   │
          │    sigweb.postes/{z}/{x}/{y}     │
          └─────────────────────────────────┘
```

---

## 5. Módulos e Funcionalidades

### 5.1 Características Gerais (req. 01–09)
**Estado atual:** 67% | **Meta:** 100%

- Sistema 100% web, suporte a Edge/Firefox/Chrome
- Controles Leaflet: zoom, pan, escala
- **[PENDENTE]** Ferramentas de medição (distâncias, áreas, perfil do terreno)
- Identificação de parcelas no mapa por clique
- **[PENDENTE]** Impressão de croqui de localização
- **[PARCIAL]** Busca por bairro/logradouro/quadra/lote (unificada)
- **[PARCIAL]** Acompanhamento do recadastramento no mapa
- Camadas vetoriais configuráveis
- Editor cartográfico 100% web (Geoman)

### 5.2 Controle de Acesso (req. 10–14)
**Estado atual:** 80% | **Meta:** 100%

Perfis de usuário:
- `ADMIN` — acesso total ao sistema
- `FISCAL` — todos os módulos operacionais
- `SETOR_PROJETOS` — processos digitais e viabilidade
- `FISCAL_CAMPO` — app móvel e chamados
- `CIDADAO` — portal cidadão (consultas e chamados)

**[PENDENTE]** Auto-cadastro de usuário (req. 11): cidadão cria conta pelo app ou pelo site.

### 5.3 Módulo Imobiliário (req. 15–30)
**Estado atual:** 34% | **Meta:** ≥80%

**Entidades de dados:**
- `parcelas` — lotes/terrenos com geometry (polygon)
- `edificacoes` — unidades imobiliárias sobre parcelas
- `bairros`, `logradouros`, `quadras`, `loteamentos`
- `pessoas` — proprietários e moradores

**Funcionalidades implementadas:**
- CRUD parcelas com geometry PostGIS
- Memorial descritivo PDF com vértices e azimutes
- Importação de BICs do app móvel
- Hash de autenticidade SHA-256

**Funcionalidades pendentes:**
- UI completa de edificações (unidades imobiliárias)
- Camadas WMS externas configuráveis
- Mini-mapa em todos os módulos
- Bidirecional tabela ↔ mapa
- Street View / 360° integrado
- Emissão de notificação de irregularidade

### 5.4 Módulo de Edição Cartográfica (req. 31–42)
**Estado atual:** 46% | **Meta:** ≥85%

**Ferramentas implementadas (Geoman):**
- Snap (endpoint, midpoint)
- Desmembramento (ST_Split)
- Unificação de lotes
- Histórico cartográfico (geometry antes/depois)
- Camadas de apoio (GeoJSON, shapefile)

**Ferramentas pendentes:**
- Buffer (expandir/contrair geometria)
- Linhas guia para desenho
- Linhas ortogonais
- Entrada de vértices por coordenada XY
- Criação por azimutes e distâncias

### 5.5 Consulta de Viabilidade (req. 43–48)
**Estado atual:** 92% | **Meta:** 100%

Três tipos de consulta:
1. **Edificação** — zona de uso, taxa de ocupação, gabarito, recuos
2. **Parcelamento** — área mínima, testada mínima
3. **Atividade econômica** — CNAE com autocomplete

Pendente: reimpressão/PDF da consulta histórica.

### 5.6 Estoque para Iluminação Pública (req. 49–55)
**Estado atual:** 7% | **Meta:** ≥90%

**Schema de dados (implementado):**
- `sigweb.estoque` — saldo por produto/local
- `sigweb.movimentacoes_estoque` — entradas/saídas/transferências

**UI pendente (alta prioridade):**
- Cadastro de Produto, Marca, Fabricante, Fornecedor
- Nota de entrada por operação interna
- Transferência entre locais
- Relatórios de saldo, movimentação, garantia
- Integração automática com OS de Iluminação

### 5.7 Iluminação Pública (req. 56–71)
**Estado atual:** 47% | **Meta:** ≥90%

**Fluxo principal:**
1. Poste cadastrado com tipo, endereço, coordenada (MVT tile)
2. Cidadão/fiscal abre solicitação de reparo
3. Analista abre OS (equipe + itens de estoque)
4. OS altera cor do poste no mapa
5. OS finalizada → movimenta estoque automaticamente

**Pendente:** Bidirecional tabela↔mapa, impressão OS com mapa, integração estoque.

### 5.8 Arborização (req. 72–86)
**Estado atual:** 43% | **Meta:** ≥90%

**Fluxo principal:** idêntico ao de Iluminação mas para árvores urbanas.

**Pendente:** Bidirecional tabela↔mapa, cor dinâmica no mapa por situação, impressão OS.

### 5.9 Cadastro Social (req. 87–94)
**Estado atual:** 50% | **Meta:** ≥85%

**Entidades:**
- `pessoas_sociais` — CID, NIS, documentos, rendas
- `familias` — composição, programa, situação
- `rendas_familia` — renda bruta e per capita calculadas automaticamente

**Pendente:** Índice de vulnerabilidade, upload de documentos, integração gráfico↔mapa.

### 5.10 Numeração Predial (req. 95–104)
**Estado atual:** 80% | **Meta:** 100%

Processo completo de atribuição de numeração: seleção do logradouro → identificação dos lotes → configuração pares/ímpares → geração → confirmação.

**Pendente:** Seleção de ponto de partida no mapa, colorização pares/ímpares.

### 5.11 Processo Digital — Aprovação de Projetos (req. 105–115)
### 5.12 Processo Digital — Habite-se (req. 116–126)
**Estado atual:** 32% | **Meta:** ≥85%

**Fluxo básico implementado:**
- Abertura de processo pelo solicitante
- Gerenciamento por analista
- Histórico de pareceres por fase
- Anexos digitais

**Pendente (alto impacto):**
- Rascunho antes de submeter
- Edição apenas onde parecer reprovado
- Seleção do imóvel no mapa ao abrir processo
- Campos configuráveis (obrigatório/opcional)
- Encaminhamento entre analistas

### 5.13 Gestão do App Móvel — Painel Web (req. 127–152)
**Estado atual:** 35% | **Meta:** ≥80%

Configura os fluxos de trabalho que o app móvel executa.

**Implementado:** Categorias, fluxos básicos, filtros, detalhe da solicitação, alteração de fase.

**Pendente:** FCM push notifications, mensagens público/privado, boletim/questionário, impressão, cor/ícone de categorias, hierarquia pai/filho.

### 5.14 App Móvel — Chamados (Android + iOS) (req. 153–166)
**Estado atual:** 0% | **Meta:** 100% | **CRÍTICO**

**Stack:** Expo (React Native) + Firebase Auth + API REST

**Funcionalidades:**
- Login e auto-cadastro
- Mapa com camadas do SIG WEB
- Criação de chamados com foto, endereço automático e pin no mapa
- Edição de foto (recorte, rotação)
- Histórico de solicitações do cidadão
- Alteração de perfil

### 5.15 App Móvel — Recadastramento Imobiliário (Android) (req. 167–181)
**Estado atual:** 0% | **Meta:** 100% | **CRÍTICO**

**Stack:** Expo + SQLite (offline) + sync

**Funcionalidades:**
- Listagem e seleção de lotes por mapa ou lista
- Preenchimento do BIC completo offline
- Captura de fotos, croquis e documentos
- Geolocalização automática do ponto de coleta
- Sync com API quando online (`POST /mobile/bics`)
- Camada de situação de recadastramento (visitado/recadastrado/pendente)

### 5.16 App Móvel — Arborização (Android) (req. 182–188)
**Estado atual:** 0% | **Meta:** 100% | **CRÍTICO**

**Funcionalidades:** similar ao de Recadastramento mas para BIC de árvores.

### 5.17 REURB Digital com BPMN (req. 189–208)
**Estado atual:** 40% | **Meta:** ≥85%

**Parte implementada:** Abertura de processo REURB, anexos, histórico de fases, gerenciamento por analista.

**BPMN pendente:**
- Editor visual de fluxo (bpmn-js) com Swim Lanes por setor
- Associação de perfis de usuário por tarefa
- Formulários dinâmicos por etapa (texto, checkbox, mapa, CPF/tel)
- Anotações em PDF (cópia imutável do original)
- Lotes REURB coloridos no mapa por etapa
- Dashboards em tempo real

### 5.18 Planta Genérica de Valores — PGV (req. 209–227)
**Estado atual:** 92% | **Meta:** 100%

Pipeline completo implementado: amostras → regressão linear → distância ao polo → valor por face de quadra → simulação IPTU.

**Pendente:** Camada temática PGV no mapa com faces de quadra coloridas por valor.

### 5.19 Nuvem de Pontos 3D (req. 228–234)
**Estado atual:** 14% | **Meta:** 85%**

**Dependência:** Dados aerofotogramétricos (previsão entrega Jun/Jul 2026).

**Stack:** Potree Viewer via iframe integrado ao SIG WEB. Dados hospedados no Cloud Storage.

**Pendente após entrega dos dados:** Configurar `VITE_POTREE_URL`, habilitar ferramentas de medição nativas do Potree.

### 5.20 SINTER (obrigação contratual)
**Estado atual:** Schema BD pronto | **Meta:** Envio aceito | **Prazo: 31/12/2026**

Envio de dados cadastrais ao Sistema Nacional de Gestão de Informações Territoriais (SINTER/RFB) em layout XML próprio.

---

## 6. Modelo de Dados — Entidades Principais

```sql
-- Cadastro territorial
sigweb.parcelas          -- lotes/terrenos (geometry polygon)
sigweb.edificacoes       -- unidades imobiliárias
sigweb.bairros           -- bairros do município
sigweb.quadras           -- quadras por bairro
sigweb.logradouros       -- logradouros/ruas
sigweb.loteamentos       -- loteamentos registrados

-- Urbano
sigweb.postes            -- postes de iluminação (geometry point)
sigweb.arvores           -- árvores urbanas (geometry point)
sigweb.os_iluminacao     -- ordens de serviço de iluminação
sigweb.os_arborizacao    -- ordens de serviço de arborização
sigweb.solicitacoes_*    -- solicitações de reparo

-- Estoque
sigweb.estoque           -- saldo por produto/local
sigweb.movimentacoes_estoque

-- Processos
sigweb.processos         -- processos digitais (aprovação, habite-se, reurb)
sigweb.etapas_processo
sigweb.pareceres_processo
sigweb.historico_fases_processo
sigweb.chamados          -- solicitações do app móvel

-- PGV / Fiscal
sigweb.pgv_setores       -- setores de cálculo PGV
sigweb.pgv_amostras      -- amostras de mercado
sigweb.pgv_faces_quadra  -- valores por face de quadra
sigweb.pgv_simulacoes    -- simulações IPTU

-- Social
sigweb.pessoas_sociais
sigweb.familias
sigweb.rendas_familia

-- Controle
sigweb.usuarios          -- usuários + perfis RBAC
sigweb.audit_log         -- auditoria de todas as mutações
sigweb.historico_cartografico -- geometry antes/depois de edições
```

---

## 7. API REST — Endpoints Principais

| Método | Rota | Módulo |
|--------|------|--------|
| GET | `/api/parcelas/all` | Imobiliário |
| GET | `/api/parcelas/:id` | Imobiliário |
| GET | `/api/parcelas/:id/memorial` | Imobiliário |
| POST | `/api/parcelas/:id/desmembrar` | Cartografia |
| POST | `/api/parcelas/unificar` | Cartografia |
| GET | `/api/viabilidade/cnaes` | Viabilidade |
| POST | `/api/viabilidade` | Viabilidade |
| GET | `/api/iluminacao/postes` | Iluminação |
| POST | `/api/iluminacao/ordens-servico` | Iluminação |
| GET | `/api/arborizacao/arvores` | Arborização |
| POST | `/api/arborizacao/ordens-servico` | Arborização |
| POST | `/api/pgv/setores/:id/calcular` | PGV |
| POST | `/api/pgv/simulacao` | PGV |
| GET | `/api/processos` | Processos |
| POST | `/api/mobile/bics` | App Móvel |
| GET | `/api/mobile/chamados` | App Móvel |
| GET | `/api/numeracao/divergencias` | Numeração |
| POST | `/api/numeracao/gerar` | Numeração |
| GET | `/api/social/familias` | Social |
| GET | `/api/admin/db-stats` | Admin |

---

## 8. Autenticação e Autorização

**Fluxo:**
1. Usuário autentica no Firebase Auth (email + senha)
2. Frontend obtém `idToken` JWT
3. Toda requisição à API envia `Authorization: Bearer <idToken>`
4. Middleware `auth.middleware.ts` verifica o token via `firebase-admin`
5. Custom claim `perfil` determina as permissões RBAC

**Perfis:**
```
ADMIN             → acesso total
FISCAL            → módulos operacionais (iluminação, arborização, processos)
SETOR_PROJETOS    → viabilidade, processos de aprovação
FISCAL_CAMPO      → app móvel, chamados
CIDADAO           → portal público, consultas, chamados próprios
```

---

## 9. Mapa / MVT Tiles

O mapa base usa OpenStreetMap via Leaflet. Dados próprios são servidos como **Mapbox Vector Tiles (MVT)** pelo `pg_tileserv`:

| Camada MVT | Tabela | Descrição |
|-----------|--------|-----------|
| `sigweb.parcelas` | `sigweb.parcelas` | Lotes com cor por zona |
| `sigweb.postes` | `sigweb.postes` | Pontos de iluminação com cor por situação |
| `sigweb.arvores` | `sigweb.arvores` | Árvores urbanas |
| `sigweb.edificacoes` | `sigweb.edificacoes` | Edificações/loteamentos |

Camadas adicionais são configuradas via `GET /api/camadas` e renderizadas como GeoJSON sobre o MVT.

---

## 10. Critérios de Aceite — Prova de Conceito

A Prova de Conceito deve demonstrar **≥95% dos 234 requisitos** funcionando em ambiente web produção.

**Pré-requisitos obrigatórios:**
- [ ] Score BACKLOG.md ≥ 222/234
- [ ] Todos os módulos principais com dados reais do município
- [ ] Apps móveis publicados (Google Play + App Store) ou TestFlight/APK de teste
- [ ] Performance: carregamento inicial < 3s, tiles do mapa < 300ms

**Módulos críticos para Prova de Conceito:**
1. Cadastro Imobiliário com parcelas reais de Tupanciretã
2. Edição cartográfica (desmembramento, unificação, histórico)
3. Consulta de Viabilidade com parâmetros reais do Plano Diretor
4. Iluminação e Arborização com fluxo OS completo
5. App Chamados (Android e iOS) demonstrável
6. Processo Digital (Aprovação + Habite-se)
7. PGV com simulação IPTU
8. Nuvem de Pontos 3D (dependente dos dados aerofotogramétricos)

---

## 11. Roadmap de Entrega

| Fase | Período | Entregáveis | Requisitos |
|------|---------|-------------|------------|
| Alpha | Semanas 1–4 | Parciais → completos; bidirecional mapa↔tabela; estoque | +55 pts → ~62% |
| Beta | Semanas 5–12 | App Chamados (Expo); Processo Digital completo | +50 pts → ~83% |
| RC | Semanas 13–20 | App Recadastramento; REURB BPMN; PGV mapa | +30 pts → ~96% |
| PoC | Semana 21 | Prova de Conceito com dados reais de Tupanciretã | ≥95% |
| Implantação | Semanas 22–26 | App Arborização; SINTER; Nuvem 3D; treinamento | 100% |

---

## 12. Riscos e Dependências Externas

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Dados aerofotogramétricos (228–234) não entregues até Jul/2026 | 7 pontos do edital bloqueados | Negociar prazo contratual para item 3D |
| SINTER: mudança de layout pelo Governo Federal | Envio inválido | Monitorar portal RFB; buffer de 2 meses |
| App Store Review (iOS) — 1–3 semanas | Atraso na PoC | Submeter com antecedência; usar TestFlight |
| Dados cadastrais do município incompletos ou inconsistentes | Módulos funcionam mas sem dados reais | Plano de migração de dados no mês 1 |
| Plano Diretor digital de Tupanciretã não disponível | Viabilidade sem parâmetros reais | Solicitar documento físico e digitar |

---

*PRD gerado com base no Edital Pregão Eletrônico nº 28/2026, Processo 903/2026.*  
*Atualizar em conjunto com o BACKLOG.md conforme o desenvolvimento avança.*
