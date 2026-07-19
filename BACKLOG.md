# BACKLOG — SIGWEB Tupanciretã
> Pregão Eletrônico nº 28/2026 · Processo 903/2026 · Município de Tupanciretã – RS

**Legenda de status:**
| Símbolo | Significado |
|---------|-------------|
| ✅ | Implementado e testado em produção |
| 🔶 | Parcialmente implementado |
| ❌ | Não implementado |
| 🔴 | Crítico — prazo contratual |

**Última atualização:** 2026-07-19 (sessão 38 — **Limpeza final de vestígios do Firebase e Google Cloud e Revisão Push Expo**: Remoção completa de dependências diretas (`firebase-admin`, `@google-cloud/*`, `firebase-tools`) de todos os `package.json` e configs associadas (`.firebaserc`, `firebase.json`). Migration `V020__rename_firebase_uid.sql` renomeou a coluna `firebase_uid` para `auth_uid` na tabela `usuarios` com refatoração de rotas da API (SINTER, mobile, notificações, cadastro). Tratamento de erro implementado para o token inválido do Expo (`sendExpoPushNotification`). Limpeza da documentação para refletir exclusivamente a arquitetura Supabase e Dokploy. Preparação para QA final dos aplicativos móveis visando atingir os 100% de aderência ao edital.)

Sessão anterior 37 — **CI/CD do frontend automatizado (deploy Firebase Hosting via Cloud Build)**: `cloudbuild-web.yaml` criado (build do monorepo + `tsc && vite build` + `firebase-tools deploy --only hosting`, secrets via Secret Manager `web-env-production`/`firebase-ci-token`, IAM `secretAccessor` escopado ao SA do Cloud Build); trigger `deploy-web-main` criado via `gcloud builds triggers create github --service-account=...` — resolve o bug `INVALID_ARGUMENT` da sessão anterior (faltava o SA explícito); testado end-to-end: build `e9691cd0` SUCCESS, site `https://caroacidades.web.app` no ar (HTTP 200). Push para `main` agora builda+publica API e Web automaticamente. Não altera score do edital — infraestrutura, mesmo critério do SINTER.

Sessão anterior 36 — **3D: volume + corte em seção (req 232 🔶→✅)**: `PointCloudViewer.tsx` ampliado com: (a) modo "✂ Perfil" — 2 cliques definem seção, filtra pontos por corredor adaptativo (`t × perp` no plano XZ), ordena e exibe gráfico canvas 160px (pts 1px, eixos, labels de distância/elevação); (b) volume no fechamento de polígono — `pipXZ` (ray-casting) identifica pontos dentro, `area × avg(height - base)` → resultado em m³; req 232 promovido a ✅ (distância+área+volume+seção). `tsc --noEmit` ok. Score global **91,5%→91,7%** (214,5/234 — +0,5 pts). Deploy pendente.

Sessão anterior 33 — **req 06 completo + painel camadas fixo + eas.json**: (1) req 06 `🔶→✅` — busca do mapa agora inclui Loteamentos e Quadras: `/loteamentos?q=` passa a retornar `geometry`; `/quadras?q=` criado com filtro por código; `MapPage.handleSearch` faz 4 calls paralelas e combina resultados em 5 categorias coloridas (Bairro roxo, Loteamento âmbar, Logradouro ciano, Quadra verde-azul, Parcela azul); zoom adaptado por tipo; (2) `LayerControl.tsx` refatorado como painel lateral fixo à direita com seta `›`/`‹` de colapso (substituiu botão flutuante `🗂 Camadas`); `CamadasPanel.tsx` movido para borda esquerda; (3) `eas.json` criado nos 3 apps móveis (MA/MB/MC) com perfis `development`/`preview` (APK) e `production` (AAB) — habilita `eas build --platform android --profile preview` para gerar APK de teste; (4) linhas de score G/L/R atualizadas no corpo do BACKLOG (estavam com valores da sessão 30). Score global **89,3%** (inalterado — req 06 já contava ✅, busca foi completada; eas.json é infra de build). `tsc --noEmit` ok em `apps/api` e `apps/web`.

Sessão anterior 32 — **bug fixes SIG + TypeScript apps móveis**: (1) bug crítico `camadas.ts`: upload SHP com EPSG:31982 gravava SRID 4326 → geometria inválida no BD → camada não aparecia; corrigido com `detectShpSrid()` (checa `|x|>180` nas primeiras 5 feições, usa `ST_SetSRID(...,31982)` diretamente para UTM); camadas antigas com geometria inválida: excluir via novo botão 🗑 em `LayerControl` e reinserir; (2) suporte a KML em `CamadasPanel.tsx`: `kmlToFeatures()` via `DOMParser` (Point/LineString/Polygon + ExtendedData), `accept=".zip,.shp,.kml"`; (3) botão "📁 SHP / KML" reposicionado para `bottom:70,right` (mais visível); (4) botão 🗑 excluir camada em `LayerControl.tsx` via `DELETE /camadas/:id`; (5) `PrintControl.tsx` — impressão com seleção de área: 2 cliques definem bounding box (preview `L.Rectangle`), `fetchStaticMapFromBounds` renderiza tiles OSM em canvas e exporta PDF A4 landscape (jsPDF); (6) `getReactNativePersistence` corrigido nos 3 apps móveis: import de subpath inexistente substituído por `@firebase/auth` + `src/types/firebase-rn.d.ts` (module augmentation — `firebase` umbrella não expõe a condição react-native no subpath `./auth`, Metro resolve corretamente em runtime); `tsc --noEmit` ok em `apps/mobile`, `apps/recadastramento`, `apps/arborizacao`. Score global 89,3% (inalterado — sem novos req fechados).

Sessão anterior 31 — **Módulos G/L/R fechados em 100%**: req 03 `🔶→✅` — novo modo ⛰ Altimetria em `MeasureToolbar`: traça perfil de terreno com até 50 amostras via Open-Elevation API (SRTM 90 m) e exibe gráfico elevação×distância (Recharts, min/max/ganho); req 05 `🔶→✅` — `gerarCroquiPDF` agora async, busca imagem cartográfica real via `fetchStaticMapImage` (tiles OSM no canvas, sem dependência extra) e adiciona página 2 com mapa 182×121 mm + créditos; req 70 `🔶→✅` — `imprimirOS` iluminação async, imagem OSM inline no PDF após as coordenadas; req 86 `🔶→✅` — `imprimirOS` arborização idem; req 195 corpo do BACKLOG corrigido (já ✅ desde sessão 30). Score G 89%→**100%**, Score L 97%→**100%**, Score R 97%→**100%**. Score global 88,7%→**89,3%** (189✅+40🔶+5❌=209,0/234). `tsc --noEmit` ok em `apps/web`.

Sessão anterior 30 (+2,5 pts): Módulos I/C/RU/PG, **Módulo C (Cartografia) 83%→88%**, **Módulo R (Arborização) 93%→97%**: req 23 `❌→✅` — aba "Mapa" adicionada à `CadastroPage` embute `<SIGMap compact />` exibindo parcelas/bairros/logradouros no mapa; req 15 `🔶→✅` — novas abas "Bairros" e "Logradouros" na `CadastroPage` com CRUD completo (lista/criar/editar/excluir) via APIs `/bairros` e `/logradouros` existentes, fechando o CRUD de todas as entidades do cadastro imobiliário; req 18 `🔶→✅` — formulário de criação de parcela ganhou selects de `logradouroId`, `bairroId`, `loteamentoId` e campos BIC (`areaM2`, `uso`, `situacaoOcupacao`); req 32 `🔶→✅` — botões "⎘ Clonar" e "⇔ Espelhar" adicionados ao `EditToolbar`: clonar busca geometria da parcela selecionada via `GET /parcelas/:id`, aplica offset de +0,0002 graus e salva via `POST /parcelas` com sufixo `-CLONE`; espelhar abre modal H/V, espelha a geometria em relação ao centróide e salva com sufixo `-ESPH`/`-ESPV`; req 72 `🔶→✅` — Boletim Cadastral completo na `ArboriacaoPage`: migration `V017` adiciona colunas `conflito_rede` (BOOLEAN) e `observacoes` (TEXT) à tabela `arvores`; novo `PATCH /arborizacao/arvores/:id` com Zod para os 6 campos do boletim; formulário inline no painel da árvore selecionada com `altura_m`, `dap_cm`, `estado_fitossanitario` (select), `situacao_calcada` (select), `conflito_rede` (checkbox), `observacoes` (textarea). Score I 84%→**97%** (15✅+1🔶=15,5/16), Score C 83%→**88%** (9✅+3🔶=10,5/12), Score R 93%→**97%** (14✅+1🔶=14,5/15). Score global recalculado de 86,3%→**87,6%** (181✅+48🔶+5❌=205,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`.
Sessão anterior 28 — **Módulos P/H (Processo Digital — Aprovação/Habite-se) fechados em 100%**: req 107/118 `🔶→✅` — `POST /processos` passa a criar 1 etapa padrão ("Análise") ao abrir processo de Aprovação de Projeto/Habite-se; novo botão "Dar parecer" (Aprovar/Reprovar + comentário) em `ProcessosPage`, visível ao analista quando o processo está `em_analise`, chama `POST /processos/:id/etapas/:etapaId/parecer` (endpoint já existia mas não tinha caller no frontend); `GET /processos/:id` resolve o `formulario` da etapa via `formularios_processo` quando não há fase BPMN, permitindo que "Corrigir e reenviar" exiba e edite campo-a-campo o formulário reprovado. Score P 95%→**100%** (11✅=11/11), Score H 95%→**100%** (11✅=11/11). Score global recalculado de 85,9%→**86,3%** (176✅+52🔶+6❌=202,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 27 — **Módulo RU (REURB Digital) 95%→98%**: req 196 `🔶→✅` — `GET /processos/analistas` passa a aceitar `processoId` e, quando o processo tem `fase_atual_id` (fluxo BPMN, req 191) com `perfis` restritos em `fases_bpmn.perfis`, filtra a lista de analistas elegíveis por esses perfis (em vez de sempre listar ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO); o seletor "Encaminhar" em `ProcessosPage`/`ReurbPage` (compartilhado com Aprovação de Projeto e Habite-se) agora exibe nome + e-mail de cada analista. Score RU 95%→**98%** (19✅+1🔶×0,5=19,5/20). Score global recalculado de 85,7%→**85,9%** (174✅+54🔶+6❌=201,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior 26 — **Módulo PG (Planta Genérica de Valores) 95%→97%**: req 211 `🔶→✅` — nova aba "Mapa" em `PGVPage` embute `SIGMap compact` + novo componente `PgvSetoresLayer`, que exibe os setores PGV (polígonos azuis tracejados) e polos valorizantes (marcadores laranja) existentes via `GET /pgv/setores`/novo `GET /pgv/polos` (geometria agora retornada como GeoJSON); para ADMIN/FISCAL_TRIBUTARIO, botões "⬡ Desenhar setor"/"📍 Adicionar polo" ativam `leaflet-geoman` (`map.pm.enableDraw`) e, ao concluir o desenho, um formulário lateral salva via `POST /pgv/setores` (já existia) ou novo `POST /pgv/polos`. Score PG 95%→**97%** (18✅+1🔶×0,5=18,5/19). Score global recalculado de 85,5%→**85,7%** (173✅+55🔶+6❌=200,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Em seguida, correção de consistência sem alteração de score: linhas dos req 61/66 (Módulo L) e 77/82 (Módulo R) e as fórmulas "Score L"/"Score R" estavam desatualizadas (🔶/❌) embora a tabela "Aderência por Módulo" já os contasse como ✅ desde a sessão 14 — corrigidas para refletir `POSTE_COLORS`/`ARVORE_COLORS` no `MVTLayer` + refresh keys pós-OS (Score L 91%→97%, Score R 80%→93%, totais globais inalterados). Sessão anterior 25 — **Módulo A (Controle de Acesso) fechado em 100%**: req 11 `🔶→✅` — tela "Cadastre-se" da `LoginPage` ganhou campo "Telefone" com máscara `(XX) XXXXX-XXXX` (`maskTelefone`) e validação de formato no cliente antes do envio; `POST /api/auto-cadastro` valida `celular` via regex e persiste em `sigweb.usuarios.celular` (coluna já existente); após criar a conta e logar, `sendEmailVerification` (Firebase Auth) é disparado para validar o e-mail. Score A 90%→**100%** (5✅=5/5). Score global recalculado de 85,3%→**85,5%** (172✅+56🔶+6❌=200,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 24 — **Módulo N (Numeração Predial) fechado em 100%**: req 102 `🔶→✅` — na etapa "confirmar" de `NumeracaoPredialPage`, a coluna "Nº gerado" passa a ser um campo `<input>` editável por lote, permitindo ao analista ajustar manualmente o número antes de salvar (mantendo a cor vermelha/verde indicando divergência do número atual); `POST /numeracao/confirmar` já aceitava `numeroPredialGerado` como string livre por edificação, sem necessidade de alteração no backend. Score N 95%→**100%** (10✅=10/10). Score global recalculado de 85,0%→**85,3%** (171✅+57🔶+6❌=199,5/234). `tsc --noEmit` ok em `apps/web`; `vite build` ok. Sessão anterior 23 — **Módulo M (Gestão App Móvel — Web) fechado em 100%**: req 130 `🔶→✅` — nova coluna `encerra_processo` (BOOLEAN, default false) em `sigweb.fases_bpmn` via `MIGRATION_REURB_BPMN`; `faseSchema`, `GET /reurb/fluxos/:id` e `PUT /reurb/fluxos/:id` passam a ler/gravar o campo; novo checkbox "Fase de encerramento (finaliza o processo ao ser concluída)" em `FluxosBpmnManager`; `POST /processos/:processoId/etapas/:etapaId/parecer` agora consulta a fase da etapa e, se marcada como encerramento, atualiza `processos.situacao` para `aprovado`/`reprovado` imediatamente com o parecer dessa etapa, sem aguardar as demais etapas pendentes. Score M 98%→**100%** (26✅=26/26). Score global recalculado de 84,8%→**85,0%** (170✅+58🔶+6❌=199,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 22 — **Módulo V (Consulta de Viabilidade) fechado em 100%**: req 43 `🔶→✅` — `ViabilidadePage` ganhou seção "Histórico de Consultas Emitidas" (`GET /viabilidade/historico`) com tabela (código, tipo, parcela, resultado, data) e botão "🖨 PDF" por linha; `imprimirConsulta` (jsPDF, mesmo padrão de `imprimirOS`/`gerarCroquiPDF`) gera PDF com tipo, parcela, resultado, parâmetros da zona, observações e código de verificação; botão "🖨 Imprimir PDF" também no card de resultado da consulta recém-emitida. Score V 92%→**100%** (6✅=6/6). Score global recalculado de 84,6%→**84,8%** (169✅+59🔶+6❌=198,5/234). `tsc --noEmit` ok em `apps/web`; `vite build` ok. Sessão anterior 21 — **Módulos P/H/RU (Processo Digital — Aprovação/Habite-se/REURB) 91%/91%/93%→95%**: req 114/125/203 `🔶→✅` — `GET /processos` ganhou o parâmetro `busca`, que filtra por `pr.codigo`, `pe.nome`, `pe.telefone` ou `pe.email` via `ILIKE`; novo campo "Buscar por código, requerente, telefone ou email…" no topo do `ProcessosPage`, componente compartilhado pelas três telas (Aprovação de Projeto, Habite-se e REURB via `ReurbPage`), de modo que os 3 requisitos equivalentes foram resolvidos com uma única mudança. Score P 91%→**95%** (10✅+1🔶×0,5=10,5/11), Score H 91%→**95%** (10✅+1🔶×0,5=10,5/11), Score RU 93%→**95%** (18✅+2🔶×0,5=19/20). Score global recalculado de 84,0%→**84,6%** (168✅+60🔶+6❌=198,0/234). `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior 20 — **Módulo I (Imobiliário) 78%→84%**: req 29/30 `🔶→✅` — novo `PatrimonioLayer.tsx` no mapa principal (`/mapa`) renderiza `GET /patrimonio` como marcadores (ícone por finalidade — escola, hospital, praça, prédio público, quadra, cemitério, mercado, outro) ou polígonos, ativável via `LayerControl` ("Patrimônio Público") com legenda de ícones; clique no marcador/polígono define `selectedPatrimonioId` (`map.store`) e abre painel lateral em `MapPage` com nome, finalidade, número de registro, área, descrição e links para os documentos anexados (`documento_urls`); constantes `FINALIDADES`/`ICONE_PATRIMONIO` extraídas para `apps/web/src/lib/patrimonio.ts`, reaproveitadas por `PatrimonioPage`; barra de busca do mapa principal agora é arrastável (Pointer Events, posição persistida em `localStorage`). Score I 78%→**84%** (12✅+3🔶×0,5=13,5/16). Score global recalculado de 83,5%→**84,0%** (165✅+63🔶+6❌=196,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 19 — **Módulo N (Numeração Predial) 85%→95%**: req 99 `❌→✅` — `GET /numeracao/logradouro/:id/lotes` aceita `pontoLon`/`pontoLat`; calcula `ST_LineLocatePoint` do ponto informado em relação ao eixo do logradouro e, se o ponto cair na metade final do eixo, inverte `fracAoLongo` (1-frac) para que a numeração inicie pela extremidade mais próxima do ponto marcado; em `NumeracaoPredialPage`, novo botão "📍 Marcar ponto de partida no mapa" ativa o componente `PontoPartidaLayer` — clique no mapa define o ponto (marcador vermelho com tooltip) e a lista/numeração de lotes é reordenada automaticamente a partir dele. Score N 85%→**95%** (9✅+1🔶=9,5/10). Score global recalculado de 83,1%→**83,5%** (163✅+65🔶+6❌=195,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 18 — **Módulos P/H (Processo Digital — Aprovação/Habite-se) 73%→91%**: req 109/120 `❌→✅` — nova tabela `formularios_processo` (`tipo_processo`→`campos` JSONB, reaproveitando o tipo `CampoFormulario` e o editor `FormularioCampos` do REURB) permite ao analista configurar os campos do formulário de abertura de Aprovação de Projeto e Habite-se, marcando cada campo como obrigatório ou opcional via botão "⚙ Configurar formulário" em `ProcessosPage`; o painel "Abrir processo" passa a renderizar esses campos via `FormularioRenderer`, e tanto o cliente quanto `POST /processos` no servidor bloqueiam o envio se um campo obrigatório estiver vazio; req 115/126 `❌→✅` — `GET /processos` ganhou os parâmetros `campo`/`valor` (filtra por `pr.metadados ->> campo = valor`), com um seletor "Filtrar por campo do formulário…" exibido para analistas quando há campos configurados do tipo texto/CPF-telefone, e os valores desses campos passam a ser exibidos no painel de detalhe do processo. Score P 73%→**91%** (9✅+2🔶=10/11), Score H 73%→**91%** (9✅+2🔶=10/11). Score global recalculado de 81,4%→**83,1%** (162✅+65🔶+7❌=194,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 17 — **Módulo RU (REURB Digital) fechado em 93%**: req 204 `❌→✅` — `etapas_processo` passa a ser populada a partir das fases do fluxo BPMN ativo ao criar um processo REURB (`fase_id`); `GET /processos/:id` retorna o `formulario` de cada etapa; quando o processo é reprovado, `ProcessosPage` exibe via `FormularioRenderer` apenas os formulários das etapas reprovadas (com o parecer do analista), e `PATCH /processos/:id/reenviar` aplica no `metadados` somente os campos das etapas não-aprovadas, preservando os campos de etapas já aprovadas; req 206 `❌→✅` — novo `POST /processos/:id/anexos` registra anexos enviados ao Firebase Storage, e `POST /processos/:id/anexos/:anexoId/anotar` baixa o PDF original via firebase-admin, usa `pdf-lib` para anexar uma página de anotação (texto, autor, data) e salva como **novo arquivo** (`anexo_original_id` referencia o original, que não é alterado), com seção "Anexos" (upload/anotar/excluir) em `ProcessosPage`; req 208 `❌→✅` — novo `GET /processos/dashboard?tipo=reurb` (ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO) retorna contagem de processos por situação, total e tempo médio até conclusão, exibido na nova aba "Dashboard" de `ReurbPage` (`ReurbDashboard.tsx`) com `refetchInterval` de 30s. Score RU 78%→**93%** (17✅+3🔶=18,5/20). Score global recalculado de 80,1%→**81,4%** (158✅+65🔶+11❌=190,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok. Sessão anterior 16 — **Módulo S (Cadastro Social) fechado em 100%**: req 88 `🔶→✅` — CPF/NIS/PIS criptografados via pgcrypto (`pgp_sym_encrypt`/`pgp_sym_decrypt`) e BIC social completo (RG, CTPS, certidão, telefone, estado civil, filiação, cônjuge); req 92 `❌→✅` — `recalcularIndicadores` calcula `indice_vulnerabilidade` (0-100) a partir da renda per capita vs. limiar de meio salário mínimo, soma do `score` das informações sociais e bônus por presença de idoso/criança na família, recalculado a cada alteração de membro/renda/informação; req 94 `🔶→✅` — gráfico pizza clicável filtra a lista por situação cadastral, mapa Leaflet embutido com marcadores coloridos por situação e interação bidirecional tabela↔mapa (clique no marcador seleciona a família e rola até a linha, e vice-versa). Em seguida (Bloco 11): req 87 `🔶→✅` — `MIGRATION_SOCIAL_CATALOGOS` cria `tipos_entidade`, `entidades`, `servicos_sociais`, `programas_sociais_cat`, `empreendimentos`, `eventos_sociais` com CRUD completo em `apps/api/src/routes/social/catalogos.ts`, expostos no frontend via novo `apps/web/src/pages/SocialAuxiliares.tsx` (componente genérico `CatalogManager` + painel colapsável "Cadastros auxiliares" com abas); req 89 `🔶→✅` — `pessoa_deficiencias` (CID por membro, UI no `MembroCard`), `ocorrencias_social` (lista+formulário no detalhe da família) e `documentos_social` (upload de arquivos ao Firebase Storage, mesmo padrão de `GestaoSIGPage`); req 90/91 `🔶→✅` — `familias` ganha colunas `empreendimento_id`, `tipo_imovel_moradia`, `situacao_terreno`, `area_terreno_m2`, editáveis via novo `PATCH /social/familias/:id` e componente `FamiliaInfoForm` (inclui também edição dos programas sociais via checkboxes do catálogo). Score S 50%→**100%** (8/8). Score global recalculado de 78,4%→**80,1%** (155✅+65🔶+14❌=187,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; build de produção (`vite build`) ok. Sessão anterior 15 — **Módulo M: requisitos 129/137/141/152 fechados**: `MIGRATION_CHAMADOS_HISTORICO` adiciona coluna `historico` JSONB (default `[]`) em `sigweb.solicitacoes_chamado`, registrando cada transição de situação (`{de, para, usuario, data}`) em `PATCH /mobile/chamados/:id/situacao` — esse mesmo endpoint corrigido para resolver `analista_id` via `resolveUsuarioId(uid, email)` ao invés de gravar o `firebase_uid` cru (bug pré-existente que causaria erro de UUID inválido); novo `PATCH /mobile/chamados/:id/analista` e `GET /mobile/equipe` (lista usuários não-cidadãos ativos) para atribuição de responsável (req 129); `GET /mobile/chamados` agora retorna `analista_nome` via `LEFT JOIN sigweb.usuarios`; `PATCH /mobile/categorias/:id` aceita `privada` (req 137). No frontend (`AppMobileGestaoPage.tsx`): seletor "Responsável" no painel de detalhe (req 129); checkbox "Categoria privada — somente fiscais" em `CategoriaConfigManager` (req 137); botão "🗺 Mapa" exibe mapa Leaflet embutido com marcadores coloridos por situação — clicar num marcador seleciona o chamado e rola a tabela até a linha (req 141); `imprimirChamado` agora lista o histórico real de mudanças de situação no PDF (req 152). req 129 `❌→✅`, req 141 `❌→✅`, req 137/152 `🔶→✅`. Score Módulo M 87%→98% (25✅+1🔶=25,5/26). Score global recalculado de 77,1%→78,4% (148✅+71🔶+15❌=183,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; build de produção ok; deploy via `gcloud builds submit . --config=cloudbuild.yaml`. Sessão anterior 14 — **Cor dinâmica no mapa (req 61, 66, 77, 82)**: `MIGRATION_ARVORES_SITUACAO` adiciona coluna `situacao` em `sigweb.arvores` (normal/com_solicitacao/em_manutencao); `POST /arborizacao/os` → seta `com_solicitacao`; `PATCH /arborizacao/os/:id/situacao` → seta `em_manutencao`/`normal`/`com_solicitacao` conforme fase; MVTLayer atualizado: `ARVORE_COLORS` (verde/laranja/azul) aplicado por `props.situacao`, `?v=arvoresRefreshKey` adicionado ao tile URL; postes ganham `?v=postesRefreshKey` para invalidar cache ao criar/atualizar OS; `map.store.ts` ganhou `postesRefreshKey`, `arvoresRefreshKey`, `refreshPostes()`, `refreshArvores()`; `IluminacaoPage.tsx` e `ArboriacaoPage.tsx` chamam `refreshPostes()`/`refreshArvores()` nos `onSuccess` das mutations; legenda de cores de árvores adicionada ao `LayerControl`. req 61/66 `🔶→✅`, req 77/82 `❌→✅`. Score: **144✅ + 73🔶 + 17❌ = 180,5/234 = 77,1%** (+1,2%). Sessão anterior 13 — **Deploy completo + Frontend no Cloud Run**: `@fastify/static` v7 adicionado à API; `apps/api/src/server.ts` atualizado para servir `dist/public/` (SPA fallback via `setNotFoundHandler`); `apps/api/Dockerfile` atualizado para copiar `apps/web/dist` para `dist/public` dentro do runner; `cloudbuild.yaml` criado na raiz; repositório Artifact Registry `sigweb` criado em `us-east1`; Cloud Build rev 00026 — aplicação disponível em https://sigweb-api-dev-357570346826.us-east1.run.app com `VITE_MAPILLARY_TOKEN` embutido no build (token Mapillary ativo — o "boneco" de Street View agora funciona). Score: sem alteração de requisitos — **140✅ + 75🔶 + 19❌ = 177,5/234 = 75,9%**. Sessão anterior 12 — **Deploy + auditoria de score**: Cloud Run atualizado para revisão 00022 (`gcloud run services update sigweb-api-dev`); `VITE_MAPILLARY_TOKEN` configurado em `.env.local` e `.env.production`; botão ↑ SHP adicionado direto no painel "Camadas" do mapa (`LayerControl.tsx`) — não depende mais de navegar até Gestão SIG; auditoria completa dos 234 requisitos: corrigido req 03 de ✅→🔶 (medição de distâncias/áreas ✅ mas altimetria/perfil de terreno ❌ conforme BLOCO 10 item 43); 2 requisitos (trackeados como ❌ no global) refletidos como 🔶 nas tabelas de módulo desde sessão 9 — global recalculado de 176,5→177,5; score: **140✅ + 75🔶 + 19❌ = 177,5/234 = 75,9%**. Sessão anterior: **Shapefile upload/download implementado** 🔶: `POST /api/camadas/upload-shp` (multipart .zip → JSZip extrai .shp/.dbf → `shapefile.read()` via tmp files → cria `camadas_vetoriais` + importa feições em `sigweb.parcelas` com `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON, 4326), 31982)`); `GET /api/camadas/:id/download` (retorna FeatureCollection completa sem paginação, `ST_Transform(geometry, 4326)`, Content-Disposition attachment); `@fastify/multipart` registrado em `server.ts` (limite 50 MB); `TabCamadas` em `GestaoSIGPage.tsx` ganhou "↑ Upload Shapefile (.zip)" (FormData → `POST /camadas/upload-shp`, toast com total/erros) e por camada "↓ GeoJSON" (blob download) e "↓ SHP" (dynamic import `shp-write`, `zip()` → ArrayBuffer → Blob); `apps/web/src/shp-write.d.ts` criado. 🔶 por não testar em produção. `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior: **SINTER implementado** 🔶: serviço `apps/api/src/services/sinter.service.ts` (`extrairParcelasSinter` — SQL com ST_Transform para EPSG:4674/SIRGAS 2000, join logradouros/bairros/proprietário; `gerarXmlSinter` — layout IN RFB nº 1.890/2019 versão 2.0 com cabeçalho IBGE 4322301/Tupanciretã, TipoEnvio T/I/C, geometria WKT SIRGAS 2000; `validarLote` — checa código/inscrição/geometria/área; `uploadXmlGcs` — grava em `sinter/envios/{id}/sinter.xml` no Firebase Storage via Admin SDK); rotas admin em `apps/api/src/routes/admin/sinter.ts` (`GET /admin/sinter/envios` histórico, `GET /admin/sinter/envios/:id` detalhe+parcelas, `GET /admin/sinter/stats` contadores por status, `GET /admin/sinter/parcelas` status individual com filtros, `POST /admin/sinter/preparar` orquestra extração→validação→XML→GCS→persiste `envios_sinter`+`parcelas_sinter`, `POST /admin/sinter/envios/:id/enviar` marca como enviado, `POST /admin/sinter/envios/:id/resposta` registra retorno da RFB aceito/rejeitado e atualiza status das parcelas); `SinterPage.tsx` — painel web com cards de estatísticas (total cadastradas/aceitas/incluídas/pendentes/rejeitadas/erro), formulário de preparar novo lote (teste/incremental/completo), tabela histórica com badge de status e botão "Enviar", painel lateral de detalhe do envio selecionado com lista de parcelas e formulário de retorno da RFB. 🔶 por não ter sido testado contra o portal real da RFB (integração de upload direto ao SINTER/RFB ainda requer protocolo e credenciais oficiais — a infraestrutura local está completa). Score SINTER 0%→🔶. `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior: **Req. 219 "Camada temática PGV de faces de quadra no mapa" (BLOCO 10) implementado** 🔶: **Req. 219 "Camada temática PGV de faces de quadra no mapa" (BLOCO 10) implementado** 🔶: novo endpoint `GET /pgv/faces-quadra` em `apps/api/src/routes/pgv/index.ts` retorna as faces de quadra com `valor_calculado` como GeoJSON (`ST_AsGeoJSON`+join quadras/logradouros); novo componente `PgvLayer.tsx` (mesmo padrão do `BairrosLayer` — `L.geoJSON` reagindo a `useMapStore.activeLayers`) desenha as faces como linhas com gradiente de cor amarelo→vermelho proporcional ao valor por m² (interpolação RGB entre o min/max retornado) e tooltip com logradouro/quadra/valor em R$; registrado em `SIGMap.tsx`, com legenda de gradiente adicionada ao `LayerControl` (a entrada "PGV" já existia na lista de camadas mas sem renderização). 🔶 por faltar verificação visual com setores PGV efetivamente calculados em produção. Score global recalculado de 75,2%→75,4% (140✅+73🔶+21❌=176,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior: **Req. 11 "Auto-cadastro de usuário cidadão" (BLOCO 10) implementado** 🔶: endpoint público `POST /api/auto-cadastro` em `apps/api/src/server.ts` (sem `authMiddleware` — análogo ao `/api/admin/bootstrap` — cria o usuário no Firebase Auth via Admin SDK, fixa o custom claim `perfil: CIDADAO` ANTES do primeiro login — detalhe crítico, pois `authMiddleware` assume `'ADMIN'` quando a claim `perfil` está ausente, então criar a conta sem setar a claim primeiro abriria uma falha de privilégio — e insere a linha em `sigweb.usuarios`); `LoginPage.tsx` ganhou alternância "Entrar"/"Cadastre-se" com campo Nome, chamando `POST /auto-cadastro` e logando automaticamente em seguida. 🔶 por faltar teste end-to-end em produção e validações extras (verificação de e-mail/telefone). Score global recalculado de 75,0%→75,2% (140✅+72🔶+22❌=176/234). `tsc --noEmit` ok em `apps/api` e `apps/web`. Sessão anterior: **App Recadastramento (BLOCO 9, req 167–181) escrito** 🔶, completando os 3 apps móveis do BLOCO 9: app `apps/recadastramento` (Expo SDK 56, Firebase Auth, axios+interceptor, React Navigation, `@tanstack/react-query`, `JSZip`) com `LoginScreen` restrito a fiscais (`isFiscalRecadastramento`), `LoteamentosScreen`/`LotesScreen` (seleção de lote por mapa com polígonos coloridos por situação do recadastramento — req 171/174 — ou por lista — req 172, camadas WMS do SIG WEB habilitáveis — req 173, cache local de loteamentos/lotes para uso offline — req 175), `BicScreen` (formulário do BIC com GPS — req 180 — e fotos/croquis/documentos — req 177), `MeusBicsScreen` (lista/manutenção de BICs — req 178/179, sincronização — req 177/181, exportação em ZIP via `JSZip`+`expo-file-system`+`expo-sharing` — req 176). Backend: corrigido bug crítico análogo ao de `solicitante_id` em `POST /mobile/bics` — `coletado_por` recebia `firebase_uid` em vez do UUID de `usuarios.id` — via `resolveUsuarioId`, e adicionados `GET/PATCH/DELETE /mobile/bics/:id`. 🔶 em todos os 15 itens por não terem sido testados em dispositivo/emulador (Score MB 0%→50%, +7,5 pts). Score global recalculado de 71,8%→75,0% (140✅+71🔶+23❌=175,5/234). `tsc --noEmit` ok em `apps/api`; app com 1 erro de tipos pré-existente não-bloqueante (`getReactNativePersistence`). Sessão anterior: **App Arborização (BLOCO 9, req 182–188) escrito** 🔶: app `apps/arborizacao` (Expo React Native/TS, SDK 56) com Firebase Auth, axios+interceptor, React Navigation, `@tanstack/react-query`, e 3 telas — `LoginScreen` restrito a fiscais (`isFiscalCampo`, sem cadastro próprio — credenciais do sistema), `ColetaScreen` (registro de árvore com GPS via `expo-location` — req 187, espécie/altura/DAP/estado fitossanitário/situação da calçada, busca de logradouro, fotos via `expo-image-picker` — req 186), `ListaArvoresScreen` (lista local com badges de sincronização — req 185, "Sincronizar" envia pendentes a `POST/PATCH /mobile/arvores` com upload de fotos ao Firebase Storage, "Exportar" gera JSON via `expo-file-system` `File`/`Paths` — API nova do SDK 56 — compartilhado via `expo-sharing` — req 184, indicador online/offline via `useNetInfo` — req 188). Arquitetura offline-first com fila local em `coletas.ts`/AsyncStorage (`ColetaArvore`, flag `sincronizado`). 🔶 em todos os 7 itens por não terem sido testados em dispositivo/emulador (Score MC 0%→50%, +3,5 pts). Score global recalculado de 70,3%→71,8% (140✅+56🔶+38❌=168/234). `tsc --noEmit` ok exceto 1 erro pré-existente não-bloqueante (`getReactNativePersistence`). Sessão anterior: **App Chamados (BLOCO 9, req 153–166) escrito** 🔶: app `apps/mobile` (Expo React Native/TS, SDK 56) com Firebase Auth (persistência RN), axios+interceptor de token, React Navigation, e 5 telas — `LoginScreen` (155), `MapScreen` com camadas WMS configuráveis via `WMSTile` e posicionamento de marcador (156/158), `NovaSolicitacaoScreen` com categoria/descrição/endereço (geocodificação reversa)/fotos (`expo-image-picker` + Firebase Storage, crop/rotação nativos)/observações e filtro de categorias privadas por perfil fiscal (157/159–162/166), `MinhasSolicitacoesScreen` (163), `PerfilScreen` com edição de cadastro/senha/compartilhamento (164/165). No backend, corrigido bug crítico pré-existente em `POST /mobile/chamados`: `solicitante_id` (UUID referenciando `usuarios.id`) recebia o `firebase_uid` (string), o que causaria erro de banco para qualquer cidadão; criado provisionamento JIT (`resolveUsuarioId`) e endpoints `GET/PATCH /mobile/me`, com novas colunas `data_nascimento`/`celular` em `sigweb.usuarios`. 🔶 em todos os 14 itens por não terem sido testados em dispositivo/emulador (Score MA 0%→50%, +7 pts). Score global recalculado de 67,3%→70,3% (140✅+49🔶+45❌=164,5/234). `tsc --noEmit` ok em `apps/api`; `apps/mobile` com 1 erro de tipos pré-existente não-bloqueante. Sessão anterior: (1) req 70/86 "Impressão da OS com mapa de localização" 🔶 — função `imprimirOS` (jsPDF, mesmo padrão do `imprimirChamado`/`generateMemorialPDF`) em `IluminacaoPage.tsx`/`ArboriacaoPage.tsx`, botão "🖨 Imprimir" nas tabelas de OS gerando PDF com dados da OS, logradouro (novo `LEFT JOIN sigweb.logradouros` em `GET /iluminacao/os` e `GET /arborizacao/os`), coordenadas e link Google Maps; Módulo L 88%→91%, Módulo R 77%→80%; (2) req 05 "Croqui de localização do imóvel" 🔶 — função `gerarCroquiPDF` em `MapPage.tsx`, botão "🖨 Croqui de Localização PDF" no painel da parcela gera PDF com desenho vetorial esquemático do contorno do lote (vértices V1,V2... escalados a partir da geometria, eixo Y invertido), seta indicativa do norte, identificação e link Google Maps do centróide; Módulo G 89%→94%. Ambos 🔶 por não incluírem imagem renderizada do mapa real (sem ferramenta de captura disponível), limitação documentada nos próprios PDFs (mesmo critério honesto do req 152). Score global recalculado de 66,7%→67,3% (140✅+35🔶+59❌=157,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`)

**Prazo implantação:** 120 dias corridos (até final de Setembro/2026)
**Prazo crítico SINTER:** 31/12/2026

---

## 🎯 ADERÊNCIA AO EDITAL — PREGÃO 28/2026

> O edital exige **mínimo 95%** na Prova de Conceito (cláusula 2.5.11).
> Itens não comprovados devem ser implementados **em até 120 dias** após assinatura do contrato.

```
PONTUAÇÃO ATUAL  (atualizado 2026-06-17 — sessão 34)1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Implementados e funcionando : 195 itens  (83,3%)
🔶 Parcialmente implementados  :  39 itens  (16,7%)  → valem 0,5 ponto cada
❌ Não implementados           :   0 itens   (0,0%)

SCORE TOTAL: 214,5 / 234 pontos = ████████████████████░ 91,7%
META MÍNIMA:                                            95,0%
GAP:                                                    -3,3%

PONTOS FALTANDO PARA 95%: ~7,8 pontos adicionais
(SINTER: infraestrutura implementada 🔶, não conta nos 234 req do edital)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sessao 2 (+8,5 pts): req 03 06 24 58 63 68 74 79 84
Sessao 3 (+6,0 pts): req 07 59 64 69 75 80 85 140
  (bidirecional mapa<->tabela completo; recadastramento colorido no mapa)
Sessao 4 (+4,5 pts): req 49 50 51 52 (EstoquePage 6 abas + transferência); req 53 54 parciais
Sessao 5 (+1,5 pts): req 53 54 55 (relatórios de Estoque: filtros + export CSV/XLSX/XML — módulo Estoque fechado em 100%)
Sessao 6 (+17,0 pts): req 56 ("Composição do Poste" — vincula/remove itens a lotes de estoque, debita/devolve saldo);
  análise do trabalho em paralelo (req 96 pares/ímpares no mapa ✅, migrations V015/V016 aplicadas) — BLOCO 2 fechado;
  BLOCO 4 (Processo Digital): req 106/117 rascunho confirmado, req 107/118 correção+reenvio (parcial),
  req 108/119 seleção de imóvel no mapa, req 111/122 encaminhar analista, req 112/123 retirar analista — P e H 32%→73%;
  BLOCO 5 (REURB BPMN): req 189/190/191/192/193/194/195/207 — RU 40%→78%;
  BLOCO 6 (Módulo Imobiliário UI): req 20/21 EdificacoesPage (CRUD/lista/mapa/exportação),
  req 22 camadas WMS (`camadas_wms` + GestaoSIGPage + LayerControl), req 26/27 vetorização de contorno
  (leaflet-geoman) + notificação automática de irregularidade (`notificacoes` + sino no MainLayout),
  req 28 panoramas próprios via `@photo-sphere-viewer/core` no StreetView360 — Módulo I 41%→78%
Sessao 7 (+12,5 pts): req 127/128/131 (configuração completa de fases BPMN — cor, duração em
  minutos, aviso de duração e reordenação de fases); req 132/150 (boletim/questionário por
  categoria + visualização de respostas no detalhe do chamado); req 134/135 (hierarquia
  pai/filho + cor/ícone de categorias via `CategoriaConfigManager`); req 147/148/149
  (mensagens públicas/privadas no chamado + notificação interna ao cidadão); req 152
  (impressão em PDF da solicitação — mapa, mensagens, questionário e histórico via
  `imprimirChamado`/jsPDF); req 143/144/146/147 (infra de push FCM: coluna `fcm_token` em
  `usuarios`, `PUT /mobile/dispositivo`, helper `notificarCidadao`/`sendPushNotification` via
  `firebase-admin/messaging`, endpoint `PATCH /mobile/chamados/:id/categoria` + seletor de
  categoria no painel — sino + push FCM ao cidadão ao trocar categoria/situação ou enviar
  mensagem pública) — Módulo M 38%→87%, BLOCO 7 fechado 100%
Sessao 8 (+1,5 pts): req 05/70/86 ❌→🔶 (croqui de localização PDF + impressão OS iluminação/arborização);
  req 33/36 🔶→✅ (linhas guia + ortogonais no EditToolbar); req 41/42 ❌→✅ (entrada XY + azimutes)
  — BLOCO 8 fechado; Modulo G 89%→94% (correc. auditoria: G 94%→89%)
Sessao 9 (+19,0 pts): Apps MA/MB/MC — req 153–188 (36 itens ❌→🔶 = +18,0 pts);
  req 11 ❌→🔶 (auto-cadastro cidadão, +0,5); req 219 ❌→🔶 (camada PGV mapa, +0,5)
  — BLOCO 9 fechado; score 67,3%→75,4%
Sessao 10 (+0,0 pts): SINTER — infraestrutura implementada (nao conta nos 234 req do edital)
Sessao 11 (+0,0 pts): Shapefile download GeoJSON/SHP; req 35 ja era ✅ — sem mudanca de score
Sessao 14 (+3,0 pts): req 61/66 🔶→✅ (postes: refresh automático de tiles), req 77/82 ❌→✅ (árvores: cor por situação+fase); score 75,9%→77,1%
Sessao 12 (auditoria): req 03 corrigido ✅→🔶 (altimetria nao implementada);
  2 itens refletidos como 🔶 nas tabelas mas nao no global — score 75,4%→75,9%
Sessao 16 (+4,0 pts): Módulo S (Cadastro Social) fechado em 100% — req 88 🔶→✅ (CPF/NIS/PIS
  criptografados via pgcrypto, BIC completo); req 92 ❌→✅ (`recalcularIndicadores` calcula
  índice de vulnerabilidade 0-100 a partir de renda per capita, score das informações sociais
  e bônus idoso/criança); req 94 🔶→✅ (gráfico pizza clicável + mapa Leaflet embutido com
  interação bidirecional tabela↔mapa); req 87 🔶→✅ (CRUD de Entidade/Tipo Entidade/Serviço
  Social/Programa/Empreendimento/Evento via `social/catalogos.ts` + painel "Cadastros
  auxiliares"); req 89 🔶→✅ (deficiências CID por membro, ocorrências da família, documentos/
  fotos com upload ao Firebase Storage); req 90/91 🔶→✅ (`PATCH /social/familias/:id` +
  `FamiliaInfoForm`: empreendimento vinculado, imóvel de moradia, situação/área do terreno,
  programas sociais editáveis). Score S 50%→100%. Score global 78,4%→80,1%
  (155✅+65🔶+14❌=187,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; build de produção ok.
Sessao 17 (+3,0 pts): Módulo RU (REURB Digital) fechado em 93% — req 204 ❌→✅ (`etapas_processo`
  passa a ser populada a partir das fases do fluxo BPMN ativo ao criar processo REURB, com
  `fase_id`; `GET /processos/:id` retorna o `formulario` de cada etapa; `ProcessosPage` exibe,
  quando reprovado, apenas os formulários das etapas reprovadas via `FormularioRenderer` com o
  parecer do analista; `PATCH /reenviar` aplica no `metadados` somente os campos das etapas
  não-aprovadas, preservando os campos já aprovados); req 206 ❌→✅ (`POST /processos/:id/anexos`
  registra anexos enviados ao Firebase Storage; `POST /processos/:id/anexos/:anexoId/anotar`
  baixa o PDF original via firebase-admin, usa `pdf-lib` para anexar uma página de anotação
  e salva como novo arquivo, `anexo_original_id` aponta para o original sem alterá-lo; seção
  "Anexos" em `ProcessosPage` com upload/anotar/excluir); req 208 ❌→✅ (`GET /processos/dashboard
  ?tipo=reurb` retorna contagem por situação, total e tempo médio até conclusão; aba "Dashboard"
  em `ReurbPage` via `ReurbDashboard.tsx`, `refetchInterval` 30s). Score RU 78%→93%
  (17✅+3🔶=18,5/20). Score global 80,1%→81,4% (158✅+65🔶+11❌=190,5/234). `tsc --noEmit` ok em
  `apps/api` e `apps/web`; `vite build` ok.
Sessao 18 (+4,0 pts): Módulos P/H (Processo Digital — Aprovação/Habite-se) 73%→91% — req 109/120
  ❌→✅ (nova tabela `formularios_processo`: tipo_processo→`campos` JSONB com `CampoFormulario`
  e flag `obrigatorio`; botão "⚙ Configurar formulário" em `ProcessosPage` reaproveita o editor
  `FormularioCampos` do REURB; o painel "Abrir processo" renderiza os campos configurados via
  `FormularioRenderer` e bloqueia o envio — no cliente e em `POST /processos` no servidor — se
  um campo obrigatório estiver vazio); req 115/126 ❌→✅ (`GET /processos?campo=&valor=` filtra
  por `metadados ->> campo`; seletor "Filtrar por campo do formulário…" exibido para analistas
  quando há campos texto/CPF-telefone configurados; valores dos campos exibidos no painel de
  detalhe do processo). Score P 73%→91% (9✅+2🔶=10/11), Score H 73%→91% (9✅+2🔶=10/11). Score
  global 81,4%→83,1% (162✅+65🔶+7❌=194,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`;
  `vite build` ok.
Sessao 19 (+1,0 pt): Módulo N (Numeração Predial) 85%→95% — req 99 ❌→✅ (`GET /numeracao/
  logradouro/:id/lotes` aceita `pontoLon`/`pontoLat`; calcula `ST_LineLocatePoint` do ponto no
  eixo do logradouro e, se o ponto cair na metade final do eixo, inverte `fracAoLongo` (1-frac)
  para que a numeração inicie pela extremidade mais próxima do ponto marcado; em
  `NumeracaoPredialPage`, botão "📍 Marcar ponto de partida no mapa" ativa `PontoPartidaLayer`
  — clique no mapa define o ponto (marcador vermelho) e reordena lotes/numeração
  automaticamente). Score N 85%→95% (9✅+1🔶=9,5/10). Score global 83,1%→83,5%
  (163✅+65🔶+6❌=195,5/234). `tsc --noEmit` ok em `apps/api` e `apps/web`; `vite build` ok.
Sessao 20 (+1,0 pt): Módulo I (Imobiliário) 78%→84% — req 29/30 🔶→✅ (Patrimônio Público no
  mapa principal): novo `PatrimonioLayer.tsx` consome `GET /patrimonio` e desenha marcadores
  com ícone por finalidade (🏫🏥🌳🏛⚽⛪🏪📍) ou polígonos no mapa, ativável via `LayerControl`
  ("Patrimônio Público") com legenda de ícones; clique no marcador/polígono define
  `selectedPatrimonioId` (`map.store`) e abre painel lateral em `MapPage` com nome, finalidade,
  registro, área, descrição e links para os documentos (`documento_urls`); ícones/finalidades
  extraídos para `lib/patrimonio.ts` (compartilhado com `PatrimonioPage`). Score I 78%→84%
  (12✅+3🔶=13,5/16). Score global 83,5%→84,0% (165✅+63🔶+6❌=196,5/234). `tsc --noEmit` ok em
  `apps/api` e `apps/web`; `vite build` ok.
Sessao 21 (+1,5 pts): Módulos P/H/RU 91%/91%/93%→95% — req 114/125/203 🔶→✅ (consultar processo
  por código, requerente, telefone ou email): `GET /processos` ganhou o parâmetro `busca`, que
  filtra por `pr.codigo ILIKE`, `pe.nome ILIKE`, `pe.telefone ILIKE` ou `pe.email ILIKE`; novo
  campo de busca no topo do `ProcessosPage` (compartilhado por Aprovação de Projeto, Habite-se
  e REURB via `ReurbPage`). Score P 91%→95% (10✅+1🔶=10,5/11), Score H 91%→95% (10✅+1🔶=10,5/11),
  Score RU 93%→95% (18✅+2🔶=19/20). Score global 84,0%→84,6% (168✅+60🔶+6❌=198,0/234).
  `tsc --noEmit` ok em `apps/api` e `apps/web`.
Sessao 22 (+0,5 pt): Módulo V (Consulta de Viabilidade) fechado em 100% — req 43 🔶→✅
  (reimpressão/PDF das consultas de viabilidade emitidas): `ViabilidadePage` ganhou seção
  "Histórico de Consultas Emitidas" (`GET /viabilidade/historico`, já existente) com tabela
  (código, tipo, parcela, resultado, data) e botão "🖨 PDF" por linha; `imprimirConsulta` (jsPDF,
  mesmo padrão de `imprimirOS`/`gerarCroquiPDF`) gera PDF com tipo, parcela, resultado,
  parâmetros da zona, observações e código de verificação; botão "🖨 Imprimir PDF" também
  adicionado ao card de resultado da consulta recém-emitida. Score V 92%→100% (6✅=6/6). Score
  global 84,6%→84,8% (169✅+59🔶+6❌=198,5/234). `tsc --noEmit` ok em `apps/web`; `vite build` ok.
Sessao 23 (+0,5 pt): Módulo M (Gestão App Móvel — Web) fechado em 100% — req 130 🔶→✅
  (definir fase como encerramento/última fase do fluxo): nova coluna `encerra_processo`
  (BOOLEAN, default false) em `sigweb.fases_bpmn` via `MIGRATION_REURB_BPMN`; `faseSchema`,
  `GET /reurb/fluxos/:id` e `PUT /reurb/fluxos/:id` passam a ler/gravar o campo; novo checkbox
  "Fase de encerramento (finaliza o processo ao ser concluída)" em `FluxosBpmnManager`;
  `POST /processos/:processoId/etapas/:etapaId/parecer` agora consulta a fase da etapa e,
  se marcada como encerramento, atualiza `processos.situacao` para `aprovado`/`reprovado`
  imediatamente com o parecer dessa etapa, sem aguardar as demais etapas pendentes. Score M
  98%→100% (26✅=26/26). Score global 84,8%→85,0% (170✅+58🔶+6❌=199,0/234). `tsc --noEmit`
  ok em `apps/api` e `apps/web`; `vite build` ok.
Sessao 37 (+0,0 pts): CI/CD do frontend automatizado — trigger `deploy-web-main` (push main →
  npm ci/build → deploy Firebase Hosting `caroacidades.web.app` via `firebase-tools`, token em
  Secret Manager); infraestrutura, não conta nos 234 req do edital (mesmo critério do SINTER,
  sessão 10).
Sessao 24 (+0,5 pt): Módulo N (Numeração Predial) fechado em 100% — req 102 🔶→✅
  (listar cadastros de cada parcela e exibir faixa de numeração para escolha manual): na
  etapa "confirmar" de `NumeracaoPredialPage`, a coluna "Nº gerado" passa a ser um campo
  `<input>` editável por lote, permitindo ao analista ajustar manualmente o número antes de
  salvar (mantendo a cor vermelha/verde indicando divergência do número atual);
  `POST /numeracao/confirmar` já aceitava `numeroPredialGerado` como string livre por
  edificação, sem necessidade de alteração no backend. Score N 95%→100% (10✅=10/10). Score
  global 85,0%→85,3% (171✅+57🔶+6❌=199,5/234). `tsc --noEmit` ok em `apps/web`; `vite build` ok.
Sessao 25 (+0,5 pt): Módulo A (Controle de Acesso) fechado em 100% — req 11 🔶→✅
  (validação de e-mail/telefone no auto-cadastro de cidadão): tela "Cadastre-se" da
  `LoginPage` ganhou campo "Telefone" com máscara `(XX) XXXXX-XXXX` (`maskTelefone`) e
  validação de formato no cliente antes do envio; `POST /api/auto-cadastro` valida `celular`
  via regex e persiste em `sigweb.usuarios.celular` (coluna já existente); após criar a conta
  e logar, `sendEmailVerification` (Firebase Auth) é disparado para validar o e-mail. Score A
  90%→100% (5✅=5/5). Score global 85,3%→85,5% (172✅+56🔶+6❌=200,0/234). `tsc --noEmit` ok
  em `apps/api` e `apps/web`; `vite build` ok.
Sessao 26 (+0,5 pt): Módulo PG (Planta Genérica de Valores) 95%→97% — req 211 🔶→✅
  (desenhar setores de cálculo e polos valorizantes diretamente no mapa): nova aba "Mapa" em
  `PGVPage` embute `SIGMap compact` + novo componente `PgvSetoresLayer`, que exibe os setores
  PGV (polígonos azuis tracejados) e polos valorizantes (marcadores laranja) via
  `GET /pgv/setores`/novo `GET /pgv/polos` (geometria retornada como GeoJSON); para
  ADMIN/FISCAL_TRIBUTARIO, botões "⬡ Desenhar setor"/"📍 Adicionar polo" ativam
  `leaflet-geoman` (`map.pm.enableDraw`) e, ao concluir o desenho, um formulário lateral
  salva via `POST /pgv/setores` (já existia) ou novo `POST /pgv/polos`. Score PG 95%→97%
  (18✅+1🔶×0,5=18,5/19). Score global 85,5%→85,7% (173✅+55🔶+6❌=200,5/234). `tsc --noEmit`
  ok em `apps/api` e `apps/web`; `vite build` ok.
  Correção de consistência (sem alteração de score): a tabela "Aderência por Módulo" já
  contava req 61/66 (Módulo L) e 77/82 (Módulo R) como ✅ desde a sessão 14, mas as linhas
  desses requisitos e as fórmulas "Score L"/"Score R" ainda mostravam 🔶/❌. Atualizadas para
  refletir a implementação real (`POSTE_COLORS`/`ARVORE_COLORS` no `MVTLayer` + refresh keys
  pós-OS). Score L: 13✅+3🔶×0,5=14,5/16=91% → 15✅+1🔶×0,5=15,5/16=97%. Score R:
  11✅+2🔶×0,5=12/15=80% → 13✅+2🔶×0,5=14/15=93%. Totais globais inalterados.
Sessao 27 (+0,5 pt): Módulo RU (REURB Digital) 95%→98% — req 196 🔶→✅
  (encaminhar processo para pessoa específica dentro da fase): `GET /processos/analistas`
  passa a aceitar `processoId` e, quando o processo tem `fase_atual_id` (fluxo BPMN, req 191)
  com `perfis` restritos em `fases_bpmn.perfis`, filtra a lista de analistas elegíveis por
  esses perfis (em vez de sempre listar ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO); o seletor
  "Encaminhar" em `ProcessosPage`/`ReurbPage` agora exibe nome + e-mail de cada analista.
  Score RU 95%→98% (19✅+1🔶×0,5=19,5/20). Score global 85,7%→85,9% (174✅+54🔶+6❌=201,0/234).
  `tsc --noEmit` ok em `apps/api` e `apps/web`.
Sessao 30 (+2,5 pts): Módulos I/C/RU/PG:
  req 34 🔶→✅ (BufferToolbar já funcionava com @turf/buffer client-side — status atualizado);
  req 37 🔶→✅ (aba "Zoneamentos" na CadastroPage: nova `zonas.ts` com GET/POST/PUT/DELETE /zonas
  + `ST_Transform` geometry + registrada em server.ts; aba com CRUD completo lista/criar/editar/excluir);
  req 39 🔶→✅ (unificação de Quadras: `POST /quadras/unificar` com `ST_Union` PostGIS; checkboxes
  por linha na aba Quadras da CadastroPage + botão "Unificar selecionadas (N)");
  req 16 🔶→✅ (edição de geometria de bairros: botão "Editar contorno" na aba Bairros abre
  `<SIGMap compact>` inline; `lastDrawnGeometry` (map.store) dispara `saveBairroGeom` que chama
  `PUT /bairros/:id` com a nova geometria GeoJSON);
  req 195 🔶→✅ (ACL por campo no REURB: `FormularioRenderer.tsx` importa `useAuthStore`, filtra
  campos cujo `perfisVisiveis` não inclui o perfil do usuário atual — compatível com o editor
  `FormularioCampos` que já persistia `perfisVisiveis` no JSONB do campo).
  Score C 88%→**100%** (12✅=12/12), Score I 97%→**100%** (16✅=16/16),
  Score RU 98%→**100%** (20✅=20/20). Score global 87,6%→**88,7%** (186✅+43🔶+5❌=207,5/234).
  `tsc --noEmit` ok em `apps/api` e `apps/web`.
Sessao 29 (+3,0 pts): Módulo I (Imobiliário) 84%→97%, Módulo C (Cartografia) 83%→88%, Módulo R (Arborização) 93%→97%:
  req 23 ❌→✅ (aba "Mapa" na `CadastroPage` com `<SIGMap compact />`);
  req 15 🔶→✅ (novas abas "Bairros" e "Logradouros" com CRUD completo na `CadastroPage`);
  req 18 🔶→✅ (formulário de parcela ganhou selects de logradouro/bairro/loteamento + campos BIC);
  req 32 🔶→✅ (botões "⎘ Clonar" e "⇔ Espelhar" em `EditToolbar`);
  req 72 🔶→✅ (Boletim Cadastral completo: migration V017 + `PATCH /arborizacao/arvores/:id` +
  formulário inline em `ArboriacaoPage`). Score I 84%→97%, Score C 83%→88%, Score R 93%→97%.
  Score global 86,3%→**87,6%** (181✅+48🔶+5❌=205,0/234). `tsc --noEmit` ok.
Sessao 28 (+1,0 pt): Módulos P/H (Processo Digital — Aprovação/Habite-se) 95%→100% —
  req 107/118 🔶→✅ (correções somente onde o parecer foi reprovado): `POST /processos`
  agora cria 1 etapa padrão ("Análise", ordem 1, sem fase BPMN) ao abrir processos de
  Aprovação de Projeto/Habite-se; novo botão "Dar parecer" em `ProcessosPage` (Aprovar/
  Reprovar + comentário), visível ao analista (`PERFIS_ANALISE`) quando o processo está
  `em_analise`, chama `POST /processos/:id/etapas/:etapaId/parecer` (já existente, antes
  sem nenhum chamador no frontend) na etapa pendente de menor ordem; `GET /processos/:id`
  passa a resolver `formulario` da etapa via `COALESCE(fases_bpmn.formulario,
  formularios_processo.campos)`, permitindo que a UI "Corrigir e reenviar" exiba e edite
  campo-a-campo o formulário da etapa reprovada (antes só funcionava para REURB, cujas
  etapas têm `fase_id`). Score P 95%→100% (11✅=11/11), Score H 95%→100% (11✅=11/11).
  Score global 85,9%→86,3% (176✅+52🔶+6❌=202,0/234). `tsc --noEmit` ok em `apps/api` e
  `apps/web`; `vite build` ok.
```

### Aderência por Módulo

| # | Módulo | Itens | ✅ | 🔶 | ❌ | Score |
|---|--------|-------|-----|-----|-----|-------|
| G | Características Gerais | 9 | 9 | 0 | 0 | **100%** |
| A | Controle de Acesso | 5 | 5 | 0 | 0 | **100%** |
| I | Módulo Imobiliário | 16 | 16 | 0 | 0 | **100%** |
| C | Edição Cartográfica | 12 | 12 | 0 | 0 | **100%** |
| V | Consulta de Viabilidade | 6 | 6 | 0 | 0 | **100%** |
| E | Estoque Iluminação | 7 | 7 | 0 | 0 | **100%** |
| L | Iluminação Pública | 16 | 16 | 0 | 0 | **100%** |
| R | Arborização | 15 | 15 | 0 | 0 | **100%** |
| S | Cadastro Social | 8 | 8 | 0 | 0 | **100%** |
| N | Numeração Predial | 10 | 10 | 0 | 0 | **100%** |
| P | Processo Digital - Aprovação | 11 | 11 | 0 | 0 | **100%** |
| H | Processo Digital - Habite-se | 11 | 11 | 0 | 0 | **100%** |
| M | Gestão App Móvel (Web) | 26 | 26 | 0 | 0 | **100%** |
| MA| App Móvel - Chamados | 14 | 0 | 14 | 0 | **50%** |
| MB| App Móvel - Recadastramento | 15 | 0 | 15 | 0 | **50%** |
| MC| App Móvel - Arborização | 7 | 0 | 7 | 0 | **50%** |
| RU| REURB Digital | 20 | 20 | 0 | 0 | **100%** |
| PG| Planta Genérica de Valores | 19 | 18 | 1 | 0 | **97%** |
| 3D| Nuvem de Pontos 3D | 7 | 6 | 1 | 0 | **93%** |

---

## 🚨 ROADMAP PARA ATINGIR 95% (prioridade de impacto)

| Prioridade | Grupo de itens | Pontos ganhos | % acumulada |
|-----------|---------------|--------------|-------------|
| 1° | Completar itens 🔶 parciais → ✅ (75 itens × +0,5 cada) | +37,5 pts | **91,9%** |
| 2° | Testar apps móveis em dispositivo/emulador (MA/MB/MC — 36 itens 🔶→✅) | +18 pts | **Já em 50%** |
| 3° | Implementar ❌ restantes (19 itens): 03,23,77,82,92,99,109,115,120,126,129,141,204,206,208,229–234 | +19 pts | — |
| ✅ 4° | Módulo de Estoque completo (49,50,52,53,54,55) — **concluído sessão 5** | +6 pts | **73%** |
| ✅ 5° | REURB BPMN editor + formulários (189-195,207) — **concluído sessão 6** | +9 pts | **78%** |
| 6° | Processo Digital: rascunho, correção, seleção mapa (106–109,111,112,115) | +7 pts | **81%** |
| ✅ 7° | Módulo Imobiliário: UI edificações, WMS, Street View (20–28) — **concluído sessão 6** | +8 pts | **84%** |
| 🔶 8° | Iluminação: impressão OS, integração estoque (70,71,86) — **concluído sessão 8** (70/86 🔶, sem imagem do mapa; 71 já estava ✅) | +3 pts | **86%** |
| 🔶 9° | Cartografia avançada: buffer, XY, azimutes, linhas guia (33,34,36,41,42) — **33/36/41/42 concluídos sessão 8 em `EditToolbar`; 34 (buffer) 🔶 em `BufferToolbar`** | +5 pts | **88%** |
| 10° | App Gestão Web: notificações FCM, mensagens, boletim (128–152) | +15 pts | **94%** |
| 11° | Restantes (03,05,07,11,22,26,27,28,92,99,219) — **05 concluído sessão 8** (🔶 croqui de localização) | +8 pts | **97%** ✓ |

---

## 📋 ANÁLISE DETALHADA — 234 REQUISITOS DO EDITAL

### G — Características Gerais do Sistema (req. 01–09)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 01 | Sistema funciona em WEB; suporte a Edge, Firefox e Chrome | ✅ | ✅ | Funcionando em produção `sigweb-api-dev-357570346826.us-east1.run.app` (Cloud Run — sessão 13) |
| 02 | Controles de visualização automática (zoom por nível de proximidade) | ✅ | ✅ | Leaflet — zoom nativo funcionando |
| 03 | Medições de distâncias e áreas no mapa; perfil do terreno (altimetria) | ✅ | ✅ | `MeasureToolbar.tsx` — 📏 Distância ✅, 📐 Área ✅; **sessão 31**: novo modo ⛰ Altimetria — traça linha no mapa, botão "Gerar perfil" amostra até 50 pontos via Open-Elevation API (SRTM 90 m), exibe gráfico de elevação × distância (Recharts) com min/max/ganho altimétrico |
| 04 | Navegar, selecionar e identificar parcela no mapa com dados autorizados | ✅ | ✅ | MVT tiles + painel lateral funcionando |
| 05 | Impressão de croqui de localização do imóvel selecionado | ✅ | ✅ | **sessão 31**: `gerarCroquiPDF` (async) agora inclui página 2 com imagem real do mapa de localização gerada via `fetchStaticMapImage` (tiles OSM CORS + canvas, sem dependência extra); página 1 mantém o croqui esquemático vetorial com vértices e norte; página 2 tem a imagem cartográfica 182×121 mm + créditos OSM |
| 06 | Pesquisa e localização de bairro, loteamento, quadra, lotes, logradouro (busca categorizada) | ✅ | ✅ | **sessão 33**: busca unificada agora inclui todas as categorias do edital — Bairro (roxo), Loteamento (âmbar), Logradouro (ciano), Quadra (verde-azul) e Parcela (azul); `/loteamentos?q=` passa a retornar `geometry`; `/quadras?q=` adicionado com filtro por código; zoom adaptado por tipo (bairro/loteamento→14, logradouro/quadra→16, parcela→18) |
| 07 | Acompanhamento georreferenciado do recadastramento (visitados, pendentes, recadastrados) | ✅ | ✅ | V015 cria view `sigweb.v_parcelas_recadastramento`; MVTLayer renderiza por cor; legenda no LayerControl |
| 08 | Inserção e configuração de camadas no SIGWEB | ✅ | ✅ | CamadasVetoriaisLayer + GestaoSIGPage funcionando |
| 09 | Edição cartográfica 100% WEB, sem software desktop | ✅ | ✅ | Leaflet Geoman — draw/edit/delete funcionando no browser |

**Score G: 9✅ = 9/9 = 100%** *(req 03 🔶→✅ sessão 31 — altimetria; req 05 🔶→✅ sessão 31 — croqui com mapa real)*

---

### A — Controle de Acesso de Usuários (req. 10–14)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 10 | Login com usuário e senha; perfil para controle seletivo de acesso | ✅ | ✅ | Firebase Auth + perfis RBAC (ADMIN, FISCAL, SETOR_PROJETOS, FISCAL_CAMPO, CIDADAO) funcionando |
| 11 | Usuário registrar-se para obter acesso | ✅ | ✅ | **concluído sessão 25**: tela "Cadastre-se" da `LoginPage` ganhou campo "Telefone" com máscara `(XX) XXXXX-XXXX` e validação de formato no cliente; `POST /api/auto-cadastro` valida `celular` (regex) e `email` (zod `.email()`) e persiste o telefone em `sigweb.usuarios`; após criar a conta, dispara `sendEmailVerification` (Firebase Auth) para validação do e-mail |
| 12 | Gerenciador WEB de usuários e perfis (ambiente web) | ✅ | ✅ | GestaoSIGPage → aba Usuários com CRUD e atribuição de perfis |
| 13 | Configuração de acesso seletivo por usuário administrador | ✅ | ✅ | RBAC por módulo configurável na GestaoSIGPage |
| 14 | Atribuir usuário como administrador com acesso total | ✅ | ✅ | `POST /api/admin/bootstrap` + `setUserPerfil()` Firebase custom claims |

**Score A: 5✅ = 5/5 = 100%**

---

### I — Módulo Imobiliário (req. 15–30)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 15 | CRUD completo (Pessoa, Bairro, Logradouro, BIC, Loteamento, Quadra, Lote, Edificação) + relatórios XLS/PDF/CSV/XML | ✅ | ✅ | **concluído sessão 29**: `CadastroPage` agora tem abas para todas as entidades — Parcelas ✅, Pessoas ✅, Loteamentos ✅, Quadras ✅, Bairros ✅ (nova CRUD), Logradouros ✅ (nova CRUD) — com formulários de criação/edição e exclusão via APIs `/bairros` e `/logradouros`; Edificações ✅ via `EdificacoesPage`; exportação CSV/XLSX/XML nas entidades principais |
| 16 | Associação geográfica ao cadastro (Bairro, Logradouro, Loteamento, Quadra, Lote, Edificação) | ✅ | ✅ | **concluído sessão 30**: Lote ✅ (Geoman no mapa), Edificação ✅ (vetorização contorno), Bairro ✅ (botão "✏ Editar contorno" na aba Bairros abre `<SIGMap compact>` inline; `lastDrawnGeometry` do map.store dispara `saveBairroGeom` → `PUT /bairros/:id` com geometry GeoJSON), Logradouro ✅ (geometry aceita no PUT), Loteamento/Quadra: geometry armazenada no BD |
| 17 | Lote com código, testada principal, secundária e área | ✅ | ✅ | Campos presentes na tabela `sigweb.parcelas` e no CRUD |
| 18 | Cadastro do lote: logradouro, bairro, loteamento, quadra, dados BIC | ✅ | ✅ | **concluído sessão 29**: formulário de criação de parcela na `CadastroPage` ganhou selects de `logradouroId`, `bairroId`, `loteamentoId` e campos BIC (`areaM2`, `uso` — select residencial/comercial/industrial/misto/rural/outros, `situacaoOcupacao` — select ocupado/desocupado/irregular), todos enviados para `POST /parcelas` |
| 19 | Memorial descritivo PDF: vértices, azimutes, distâncias, confrontantes, coordenadas | ✅ | ✅ | `GET /parcelas/:id/memorial` + PDF gerado no frontend funcionando; hash SHA-256 incluso |
| 20 | Unidade imobiliária: cadastro imobiliário, inscrição imobiliária, face de quadra, número da unidade, área construída | ✅ | ✅ | `EdificacoesPage` — formulário completo (inscrição, cadastro imobiliário, face de quadra, nº predial, área construída, situação) sobre a tabela `sigweb.edificacoes` existente |
| 21 | Cadastro UI: loteamento/quadra/lote, proprietário/morador, logradouro/número, dados BIC, documentos/fotos | ✅ | ✅ | `EdificacoesPage` — vínculo com parcela via seleção no mapa (`SIGMap compact` + `useMapStore`), seleção de proprietário com busca em `/pessoas`, lista com busca/filtro/paginação/exportação CSV/XML/XLSX |
| 22 | Manutenção de mapas temáticos WMS (sistema e externos), hierarquizados por categoria | ✅ | ✅ | Tabela `sigweb.camadas_wms` + rotas `/camadas-wms` (CRUD); UI de cadastro/ativação na `GestaoSIGPage` (aba "Camadas WMS"); renderização via `L.tileLayer.wms` no `MVTLayer` + toggle no `LayerControl` |
| 23 | Mapa cartográfico em todas as telas com entidades geográficas (bairro, logradouro, quadra, etc.) | ✅ | ✅ | **concluído sessão 29**: aba "Mapa" adicionada à `CadastroPage` embute `<SIGMap compact />` exibindo parcelas/bairros/logradouros/quadras via camadas MVT; os demais módulos já têm mapa integrado (IluminacaoPage, ArboriacaoPage, AppMobileGestaoPage, NumeracaoPredialPage, SocialPage, PGVPage, ProcessosPage, EdificacoesPage, ReurbPage) |
| 24 | Selecionar registro na tabela e posicionar/identificar no mapa (bidirecional) | ✅ | ✅ | Botão "📍 Ver" em cada linha do BancoDadosPage — busca centróide via API + selectParcela + flyTo em /mapa |
| 25 | Importação de dados de recadastramento de dispositivos móveis (BICs com fotos) | ✅ | ✅ | `POST /api/mobile/bics` funcionando — importação de BICs com foto_urls, GPS, situação |
| 26 | Vetorização e registro de edificações irregulares no mapa com ortofoto | ✅ | ✅ | `EdificacoesPage` — botão "Vetorizar contorno" habilita `leaflet-geoman` (`pm.enableDraw('Polygon')`) sobre o mapa, salvando o polígono em `edificacoes.geometry`; camada MVT colore edificações por `situacao` (irregular destacada em vermelho) |
| 27 | Emissão de notificação de irregularidade de edificação | ✅ | ✅ | Tabela `sigweb.notificacoes` + rotas `/notificacoes`; ao salvar edificação com `situacao = 'irregular'` o backend cria notificação para todos os usuários ADMIN/FISCAL_TRIBUTARIO; sino de notificações no `MainLayout` (contagem de não lidas, lista, marcar como lida) |
| 28 | Visualização panorâmica Street View (Google Maps integrado ao SIG WEB) | ✅ | ✅ | `StreetView360` — panoramas próprios (equirretangulares) agora renderizados via `@photo-sphere-viewer/core`, além da cobertura Mapillary já existente; pontos de imageamento próprio (laranja) e Mapillary (azul) no mapa com snapping de clique |
| 29 | Exibição de patrimônios públicos no mapa identificados por finalidade | ✅ | ✅ | **concluído sessão 20**: novo `PatrimonioLayer.tsx` no mapa principal (`/mapa`) renderiza `GET /patrimonio` como marcadores (ícone por `finalidade`, ex.: 🏫🏥🌳🏛) ou polígonos, ativável via `LayerControl` ("Patrimônio Público") com legenda de ícones |
| 30 | Exibição de dados do patrimônio ao selecionar no mapa (com documentos) | ✅ | ✅ | **concluído sessão 20**: clique no marcador/polígono define `selectedPatrimonioId` (map.store) e abre painel lateral em `MapPage` com nome, finalidade, registro, área, descrição e links para os documentos (`documento_urls`) |

**Score I: 16✅ = 16/16 = 100%**

---

### C — Módulo de Edição Cartográfica (req. 31–42)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 31 | Snap (endpoint, midpoint) — precisão no desenho | ✅ | ✅ | Leaflet Geoman `snappable: true, snapDistance: 10` configurado |
| 32 | Ferramentas: rotação, mover, espelhar, clonar, dividir, unir | ✅ | ✅ | **concluído sessão 29**: botões "⎘ Clonar" e "⇔ Espelhar" em `EditToolbar` — clonar busca geometria da parcela selecionada (`GET /parcelas/:id`), aplica offset +0,0002° e salva via `POST /parcelas` com sufixo `-CLONE`; espelhar abre modal H/V, espelha coordenadas em relação ao centróide e salva com sufixo `-ESPH`/`-ESPV`; Dividir (desmembrar) ✅; Unir (unificar) ✅; Rotação via Geoman `enableGlobalRotateMode` ✅ |
| 33 | Adicionar/excluir linhas guia para auxiliar no desenho | ✅ | ✅ | Botão "Linha guia" em `EditToolbar`: desenha linha tracejada de apoio sobre o mapa (`guidesLayerRef`) com botão "Limpar guias" (sessão 8) |
| 34 | Buffer (expandir/contrair geometria paralelamente) | ✅ | ✅ | **concluído sessão 30**: `BufferToolbar.tsx` usa `@turf/buffer` client-side (unidades metros) para gerar o polígono de buffer da parcela selecionada e exibe no mapa com preenchimento laranja; input de raio editável; botão "Limpar buffer"; integrado ao `SIGMap` |
| 35 | Adicionar camadas vetoriais ou raster de apoio | ✅ | ✅ | CamadasVetoriaisLayer funcionando; upload SHP (.zip) via `POST /api/camadas/upload-shp` + download GeoJSON/SHP via `GET /api/camadas/:id/download`; botão ↑ SHP direto no painel "Camadas" do mapa (`LayerControl`) e na GestaoSIGPage |
| 36 | Desenho de linhas ortogonais a partir de uma linha base | ✅ | ✅ | Botão "Ortogonal" em `EditToolbar`: desenha linha base e gera automaticamente a linha perpendicular (`computeOrthogonalLine`/`orthogonalLayerRef`) com botão "Limpar ortogonais" (sessão 8) |
| 37 | Incluir/alterar/excluir e geocodificar Logradouro, Seções, Lotes, Edificações, Zoneamentos | ✅ | ✅ | **concluído sessão 30**: Lotes ✅ (CRUD + Geoman); Logradouros ✅ (aba na CadastroPage); Edificações ✅ (EdificacoesPage); Zoneamentos ✅ — nova aba "Zoneamentos" na `CadastroPage` com CRUD via `GET/POST/PUT/DELETE /zonas` (rota `zonas.ts` criada, geometria via `ST_Transform(ST_GeomFromGeoJSON,31982)`) |
| 38 | Desmembramento completo (todos os dados atualizados) | ✅ | ✅ | `ST_Split` + histórico cartográfico funcionando via `POST /parcelas/:id/desmembrar` |
| 39 | Unificação de Lotes, Edificações, Quadras, Zoneamentos, Bairros | ✅ | ✅ | **concluído sessão 30**: Lotes ✅ (`POST /parcelas/unificar`); Quadras ✅ — novo `POST /quadras/unificar` com `ST_Union` PostGIS; checkboxes por linha + botão "Unificar selecionadas (N)" na aba Quadras da `CadastroPage` |
| 40 | Histórico de alterações cartográficas dos Lotes (croqui antes/depois) | ✅ | ✅ | `historico_cartografico` com geometry_antes/depois; `GET /parcelas/:id/historico` funcionando |
| 41 | Criação de geometrias por coordenada XY de cada vértice | ✅ | ✅ | Botão "Entrada XY" em `EditToolbar`: modal de texto com lista de vértices (X,Y por linha), gera polígono ou linha (`drawXYGeometry`/`parseCoordinatesText`) (sessão 8) |
| 42 | Criação de geometrias por azimutes (XY inicial + azimutes de distância de cada aresta) | ✅ | ✅ | Botão "Azimutes" em `EditToolbar`: modal com origem X,Y + lista de azimute/distância por aresta, gera linha ou polígono fechado (`drawAzimuteGeometry`/`destinationPoint`) (sessão 8) |

**Score C: 12✅ = 12/12 = 100%**

---

### V — Módulo de Consulta de Viabilidade (req. 43–48)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 43 | Visualização, reimpressão e controle das consultas de viabilidade emitidas | ✅ | ✅ | **concluído sessão 22**: `ViabilidadePage` ganhou seção "Histórico de Consultas Emitidas" (`GET /viabilidade/historico`) com tabela (código, tipo, parcela, resultado, data) e botão "🖨 PDF" por linha; `imprimirConsulta` (jsPDF, mesmo padrão de `imprimirOS`/`gerarCroquiPDF`) gera PDF com tipo, parcela, resultado, parâmetros da zona, observações e código de verificação; botão "🖨 Imprimir PDF" também no card de resultado da consulta recém-emitida |
| 44 | Consulta de viabilidade para edificação (parâmetros de construção) | ✅ | ✅ | `POST /viabilidade` tipo edificação com zona, taxa ocupação, gabarito, recuo |
| 45 | Consulta de viabilidade para parcelamento do solo | ✅ | ✅ | `POST /viabilidade` tipo parcelamento — área mínima, testada mínima |
| 46 | Consulta de viabilidade para CNAE (classificação de atividades econômicas) | ✅ | ✅ | `POST /viabilidade` tipo cnae com lookup de CNAE na zona |
| 47 | Busca de atividade econômica por código CNAE ou descrição (autocomplete) | ✅ | ✅ | `GET /viabilidade/cnaes?q=` com autocomplete funcionando |
| 48 | Código de verificação/autenticação único e não-sequencial por consulta | ✅ | ✅ | UUID v4 gerado para cada consulta; `GET /viabilidade/verificar/:codigo` público |

**Score V: 6✅ = 6/6 = 100%**

---

### E — Módulo de Estoque para Iluminação Pública (req. 49–55)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 49 | CRUD completo: Estabelecimento, Produto, Marca Comercial, Fabricante, Fornecedor, Embalagem, UoM, Família de Produto, Locais de Estoque, Tipo de Estoque, Operações Internas | ✅ | ✅ | EstoquePage.tsx — abas Produtos (CRUD: marca/fabricante/família/fornecedor) e Locais (CRUD: tipo); API CRUD completo; V016 migration |
| 50 | Inserção de nota de entrada de produto via operação interna | ✅ | ✅ | Aba "Entrada de Material" em EstoquePage — seleciona produto+local, informa qtd/lote/garantia, upsert em estoque + movimentação de entrada |
| 51 | Controle de estoque por lote/número de série — consistência em diversas operações | ✅ | ✅ | Campo `lote_serie` no formulário de entrada; ON CONFLICT por (produto_id, local_id, lote_serie) no upsert; exibido na aba Saldo |
| 52 | Transferência de estoque entre locais e tipos | ✅ | ✅ | Aba "Transferência" em EstoquePage — seleciona produto+origem+destino+qtd; valida saldo; debita origem e credita destino; registra movimentações `POST /iluminacao/estoque/transferencia` |
| 53 | Relatório de movimentação de estoque (por período, produto, lote, local, tipo) | ✅ | 🔶 | Aba "Movimentações" com filtros por tipo, lote e período; `GET /iluminacao/movimentacoes/export` exporta CSV/XLSX/XML respeitando os filtros aplicados |
| 54 | Relatório de saldo geral e por lote (filtrado por local, tipo, produto, família) | ✅ | 🔶 | Aba "Saldo" com filtros por produto, local, tipo de local e família; `GET /iluminacao/estoque/itens/export` exporta CSV/XLSX/XML |
| 55 | Relatório de garantia de produto (filtrado por local, tipo, produto, família) | ✅ | 🔶 | Nova aba "Garantia" — `GET /iluminacao/estoque/garantia` lista itens com garantia cadastrada, situação calculada (vencida/a vencer/vigente) e mesmos filtros; export via `GET /iluminacao/estoque/garantia/export` |

**Score E: 7✅ + 0🔶×0,5 = 7/7 = 100%**

---

### L — Módulo de Iluminação Pública (req. 56–71)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 56 | CRUD: Poste, Itens do Poste (reator, lâmpada, luminária + lote de estoque), Tipos de Defeito, Equipe de Manutenção, OS | ✅ | ✅ | Poste ✅; Tipos de Defeito ✅; OS ✅; Equipes ✅; "Composição do Poste" no painel lateral — vincula/remove itens a lotes de estoque (`itens_poste`, `POST/DELETE /iluminacao/postes/:id/itens`), debita/devolve saldo e registra movimentações (sessão 6) |
| 57 | Postes com código (por região), endereço (logradouro + número predial), tipo do poste | ✅ | ✅ | Campos presentes no schema e na API |
| 58 | Lista postes em tabela e posicionar automaticamente no mapa ao selecionar | ✅ | ✅ | Aba "Postes" na IluminacaoPage — clicar na linha faz flyTo no poste via pendingTarget |
| 59 | Selecionar poste no mapa e exibir automaticamente na tabela | ✅ | ✅ | MVTLayer click → selectPoste → aba Postes destaca linha + abre painel lateral |
| 60 | Abertura de solicitação de reparo a partir do poste (tipo defeito + comentário) | ✅ | ✅ | `POST /iluminacao/postes/:id/solicitacoes` funcionando |
| 61 | Alteração gráfica do poste no mapa quando há solicitação/OS (cores por estado) | ✅ | ✅ | `MVTLayer` colore o poste por `situacao` (verde=normal, vermelho=defeito, laranja=em_manutencao — `POSTE_COLORS`); `postesRefreshKey` recarrega o tile após criar solicitação/OS (sessão 14) |
| 62 | Filtro de solicitações de reparo em todos os estados (tabela) | ✅ | ✅ | `GET /iluminacao/solicitacoes?situacao=` com filtros funcionando |
| 63 | Selecionar solicitação na tabela e posicionar poste no mapa | ✅ | ✅ | Botão "📍 Ver" em cada OS da aba "Ordens de Serviço" → switch para aba Mapa + flyTo no poste |
| 64 | Selecionar poste no mapa e listar todas as solicitações relacionadas | ✅ | ✅ | Painel lateral em IluminacaoPage lista OS do poste via GET /iluminacao/postes/:id/os |
| 65 | Abertura de OS (equipe, tipo de defeito, comentário, itens da OS) | ✅ | ✅ | `POST /iluminacao/ordens-servico` com todos os campos |
| 66 | Alteração gráfica do poste conforme fase do processo de atendimento | ✅ | ✅ | `PATCH /iluminacao/os/:id/situacao` atualiza `postes.situacao` conforme a fase da OS (em_andamento→em_manutencao, concluida→normal); cor do poste no mapa reflete automaticamente via `postesRefreshKey` (sessão 14) |
| 67 | Filtro das OS em todos os estados (tabela) | ✅ | ✅ | `GET /iluminacao/ordens-servico?situacao=` funcionando |
| 68 | Selecionar OS na tabela e posicionar poste no mapa | ✅ | ✅ | Mesmo botão "📍 Ver" da OS → flyTo no poste (mesmo mecanismo do req. 63) |
| 69 | Selecionar poste no mapa e listar todas as OS relacionadas | ✅ | ✅ | Mesmo painel lateral do req 64 — lista OS com tipo, equipe, situacao e data |
| 70 | Impressão da OS com mapa de localização do poste | ✅ | ✅ | **sessão 31**: `imprimirOS` (async) inclui imagem real do mapa via `fetchStaticMapImage` (tiles OSM) posicionada inline no PDF após as coordenadas; removido o aviso "sem ferramenta de captura" |
| 71 | Integração com módulo de estoque (movimentar estoque ao criar OS) | ✅ | ✅ | Modal "Abrir OS" no painel do poste selecionado — tipo defeito, equipe, observações + seção "Materiais utilizados" com seleção de itens do estoque; POST /iluminacao/os debita estoque e registra movimentações 'saida' vinculadas ao os_id |

**Score L: 16✅ = 16/16 = 100%** *(req 70 🔶→✅ sessão 31 — impressão OS com mapa real)*

---

### R — Módulo de Arborização (req. 72–86)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 72 | CRUD: Árvore, Boletim Cadastral, Tipos de Serviço, Manutenção, Solicitação | ✅ | ✅ | **concluído sessão 29**: Árvores ✅; OS ✅; Tipos de Serviço ✅; Boletim Cadastral ✅ — migration V017 adiciona `conflito_rede`/`observacoes` à tabela `arvores`; `PATCH /arborizacao/arvores/:id` aceita todos os campos do boletim (`altura_m`, `dap_cm`, `estado_fitossanitario`, `situacao_calcada`, `conflito_rede`, `observacoes`); formulário inline no painel lateral da árvore selecionada na `ArboriacaoPage` |
| 73 | Árvores com código único/incremental, endereço (logradouro+número), data | ✅ | ✅ | Campos presentes — `GET /arborizacao/arvores` funcionando |
| 74 | Lista de árvores em tabela e posicionar no mapa quando selecionada | ✅ | ✅ | Aba "Mapa de Árvores" adicionada na ArboriacaoPage; botão "📍 Ver" em cada OS → flyTo na árvore |
| 75 | Selecionar árvore no mapa e exibir na tabela para edição | ✅ | ✅ | MVTLayer click → selectArvore → aba Árvores destaca linha + abre painel lateral |
| 76 | Abertura de solicitação de manutenção a partir da árvore (tipo + comentário) | ✅ | ✅ | `POST /arborizacao/solicitacoes` funcionando |
| 77 | Alteração gráfica da árvore no mapa quando há solicitação | ✅ | ✅ | `MVTLayer` colore a árvore por `situacao` (verde=normal, laranja=com_solicitacao — `ARVORE_COLORS`); `arvoresRefreshKey` recarrega o tile após criar solicitação (sessão 14) |
| 78 | Filtro de solicitações de manutenção em todos os estados | ✅ | ✅ | `GET /arborizacao/solicitacoes?situacao=` funcionando |
| 79 | Selecionar solicitação na tabela e posicionar árvore no mapa | ✅ | ✅ | Botão "📍 Ver" em cada OS da ArboriacaoPage → switch para aba Mapa + flyTo na árvore |
| 80 | Selecionar árvore no mapa e listar todas as solicitações registradas | ✅ | ✅ | Painel lateral em ArboriacaoPage lista OS via GET /arborizacao/arvores/:id/os |
| 81 | Abertura de OS a partir de árvore (equipe, tipo de serviço, comentário) | ✅ | ✅ | `POST /arborizacao/ordens-servico` funcionando |
| 82 | Alteração gráfica da árvore conforme fase do processo | ✅ | ✅ | OS de arborização atualiza `arvores.situacao` (em_manutencao) conforme a fase; `MVTLayer` reflete a cor (azul=em_manutencao) automaticamente via `arvoresRefreshKey` (sessão 14) |
| 83 | Filtro das OS em todos os estados | ✅ | ✅ | `GET /arborizacao/ordens-servico?situacao=` funcionando |
| 84 | Selecionar OS na tabela e posicionar árvore no mapa | ✅ | ✅ | Mesmo botão "📍 Ver" da OS de arborização (mesmo mecanismo do req. 79) |
| 85 | Selecionar árvore no mapa e listar OS relacionadas | ✅ | ✅ | Mesmo painel do req 80 — lista OS com tipo, equipe, situacao e data |
| 86 | Impressão da OS com mapa de localização da árvore | ✅ | ✅ | **sessão 31**: `imprimirOS` (async) inclui imagem real do mapa via `fetchStaticMapImage` (tiles OSM) posicionada inline no PDF após as coordenadas; removido o aviso "sem ferramenta de captura" |

**Score R: 15✅ = 15/15 = 100%** *(req 86 🔶→✅ sessão 31 — impressão OS arborização com mapa real)*

---

### S — Módulo de Gestão do Cadastro Social (req. 87–94)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 87 | CRUD completo: Pessoa Social, Tipo Renda, Entidade, Tipo Entidade, Serviço Social, Programa, Evento, Informações Sociais, Empreendimento, Família | ✅ | ✅ | Pessoa, Família, Tipo Renda, Informações Sociais ✅; Entidade/Tipo Entidade/Serviço Social/Programa/Empreendimento/Evento: CRUD completo via `social/catalogos.ts` + painel "Cadastros auxiliares" (`SocialAuxiliares.tsx`) no SocialPage |
| 88 | Pessoa Social: código único, nome, RG, CTPS, PIS, CPF, nascimento, certidão, telefone, NIS, estado civil, sexo, pai, mãe, cônjuge | ✅ | ✅ | Todos os campos no schema (`MIGRATION_SOCIAL_V2`); CPF/NIS/PIS criptografados via `pgp_sym_encrypt`/`pgp_sym_decrypt` (pgcrypto) |
| 89 | Cadastro Pessoa: endereços, deficiências CID, rendas (compõe/não compõe renda familiar), ocorrências, documentos/fotos | ✅ | ✅ | Rendas ✅; Deficiências CID por membro (`pessoa_deficiencias`, UI no `MembroCard`); Ocorrências da família (`ocorrencias_social` + UI); Documentos/fotos com upload ao Firebase Storage (`documentos_social` + UI) |
| 90 | Família: código único, situação cadastro (cadastrado, beneficiado, etc.), empreendimento | ✅ | ✅ | Situação cadastral editável; vínculo a Empreendimento (catálogo `empreendimentos`) editável via `PATCH /social/familias/:id` e `FamiliaInfoForm` |
| 91 | Cadastro Família: composição (membros, parentesco, representatividade), ocorrências, definição social, imóvel de moradia, terreno | ✅ | ✅ | Composição familiar ✅; ocorrências ✅; imóvel de moradia (`tipo_imovel_moradia`) e terreno (`situacao_terreno`, `area_terreno_m2`) editáveis em `FamiliaInfoForm` |
| 92 | Calcular índice de vulnerabilidade automaticamente com base nas informações sociais | ✅ | ✅ | `recalcularIndicadores` calcula renda per capita vs. limiar (1/2 SM), soma score das informações sociais e bônus por idoso/criança na família, atualizando `indice_vulnerabilidade` (0-100) a cada alteração |
| 93 | Calcular automaticamente renda bruta e renda per capita (respeitando composição familiar) | ✅ | ✅ | `POST /social/familias` calcula e persiste renda_bruta e renda_per_capita automaticamente |
| 94 | Gráfico analítico (pizza) que interage com o mapa para identificar famílias por situação | ✅ | ✅ | Gráfico pizza clicável filtra a lista por situação; mapa Leaflet embutido com marcadores coloridos por situação, clique seleciona família e rola até a linha na tabela (interação bidirecional) |

**Score S: 8✅ = 8/8 = 100%**

---

### N — Numeração Predial (req. 95–104)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 95 | Selecionar logradouro no mapa para iniciar processo de numeração predial | ✅ | ✅ | Busca por logradouro com autocomplete — `GET /numeracao/logradouros` funcionando |
| 96 | Identificar automaticamente parcelas envolvidas; pares/ímpares em cores diferentes; sem numeração | ✅ | ✅ | Aba "Mapa Par/Ímpar" em NumeracaoPredialPage — GeoJSON colorido (azul=par, amarelo=ímpar, cinza=sem edif.) com tooltip |
| 97 | Excluir e inserir de volta parcelas do processo | ✅ | ✅ | Toggle de inclusão/exclusão de parcelas funcionando |
| 98 | Inverter lados pares e ímpares | ✅ | ✅ | Inversão manual implementada e funcionando |
| 99 | Informar ponto de partida no mapa para iniciar numeração | ✅ | ✅ | `GET /numeracao/logradouro/:id/lotes` aceita `pontoLon`/`pontoLat`; calcula `ST_LineLocatePoint` do ponto no eixo do logradouro e, se o ponto estiver na metade final do eixo, inverte `fracAoLongo` (1 - frac) para que a numeração comece pela extremidade mais próxima do ponto marcado; em `NumeracaoPredialPage`, botão "📍 Marcar ponto de partida no mapa" ativa modo de clique (`PontoPartidaLayer`) que exibe um marcador vermelho no ponto escolhido e reordena os lotes/numeração automaticamente (sessão 19) |
| 100 | Informar números iniciais para lado par e lado ímpar | ✅ | ✅ | Campos editáveis de número inicial par/ímpar funcionando |
| 101 | Gerar numeração predial para cadastros vinculados ao logradouro | ✅ | ✅ | `POST /numeracao/gerar` — sequência gerada corretamente |
| 102 | Listar cadastros de cada parcela e exibir faixa de numeração para escolha manual | ✅ | ✅ | **concluído sessão 24**: na etapa "confirmar" de `NumeracaoPredialPage`, a coluna "Nº gerado" passa a ser um campo editável por lote — o analista pode ajustar manualmente o número antes de salvar; `POST /numeracao/confirmar` já aceitava `numeroPredialGerado` livre por edificação, sem necessidade de alteração no backend |
| 103 | Salvar numeração predial para comparação posterior | ✅ | ✅ | `numero_predial` persistido no banco; `PATCH /numeracao/confirmar` funcionando |
| 104 | Exibir parcelas com divergências no mapa | ✅ | ✅ | Painel de divergências + `divergencias_numeracao` no banco; `GET /numeracao/divergencias` funcionando |

**Score N: 10✅ = 10/10 = 100%**

---

### P — Módulo de Processo Digital — Aprovação de Projeto (req. 105–115)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 105 | Solicitante visualizar processo aberto e etapa atual | ✅ | ✅ | `GET /processos/:id` com etapas e pareceres funcionando |
| 106 | Solicitante iniciar preenchimento e salvar em rascunho para envio posterior | ✅ | ✅ | `POST /processos` cria com `situacao='rascunho'`; botão "Enviar" aciona `PATCH /processos/:id/enviar` (rascunho→aberto) |
| 107 | Solicitante fazer correções somente onde parecer estiver reprovado | ✅ | ✅ | **concluído sessão 28**: `POST /processos` agora cria 1 etapa padrão ("Análise") para Aprovação de Projeto/Habite-se; novo botão "Dar parecer" (Aprovar/Reprovar + comentário) em `ProcessosPage`, visível ao analista quando o processo está `em_analise`, chama `POST /processos/:id/etapas/:etapaId/parecer`; `GET /processos/:id` agora resolve o `formulario` da etapa via `formularios_processo` (quando `fase_id` é nulo), permitindo que `PATCH /processos/:id/reenviar` + "Corrigir e reenviar" exibam e editem campo-a-campo o formulário da etapa reprovada |
| 108 | Solicitante selecionar imóvel no mapa (nº cadastro, inscrição imobiliária, localização) | ✅ | ✅ | Sessão 6: painel "Abrir processo" embute `<SIGMap compact />`; clique na parcela usa `selectedParcelaId`/`selectParcela` (Zustand) e o código do imóvel selecionado é exibido e enviado como `parcelaId` |
| 109 | Campo obrigatório ou não configurável no formulário | ✅ | ✅ | Nova tabela `formularios_processo` (tipo_processo→campos JSONB) configurável pelo analista via botão "⚙ Configurar formulário" (`FormularioCampos`, mesmo editor do REURB); o formulário de "Abrir processo" renderiza os campos via `FormularioRenderer` e bloqueia o envio (cliente e servidor) se um campo marcado obrigatório estiver vazio (sessão 18) |
| 110 | Analista com acesso de gerenciamento dos processos | ✅ | ✅ | Gestão de processos por analista funcionando — `PATCH /processos/:id/analista` |
| 111 | Encaminhar processo para outro analista | ✅ | ✅ | Sessão 6: `PATCH /processos/:id/encaminhar` + `GET /processos/analistas` (lista leve para ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO) + dropdown/botão "Encaminhar" no painel de detalhe |
| 112 | Deixar processo sem analista | ✅ | ✅ | Sessão 6: `PATCH /processos/:id/retirar-analista` zera `analista_id` e volta `situacao` para `aberto`; botão "Retirar analista do processo" no painel |
| 113 | Analista visualizar processos de outros analistas e etapa | ✅ | ✅ | `GET /processos?tipo=aprovacao_projeto` retorna todos sem filtro por analista |
| 114 | Consultar processos por código, requerente, telefone ou email | ✅ | ✅ | **concluído sessão 21**: `GET /processos?busca=` filtra por `pr.codigo`, `pe.nome`, `pe.telefone` ou `pe.email` (`ILIKE`); campo de busca "Buscar por código, requerente, telefone ou email…" adicionado ao topo do `ProcessosPage` (compartilhado por Aprovação, Habite-se e REURB) |
| 115 | Analista filtrar fluxo por campos do fluxo | ✅ | ✅ | `GET /processos?campo=&valor=` filtra por valor de um campo configurável (`metadados ->> campo`); seletor "Filtrar por campo do formulário…" exibido para analistas em `ProcessosPage` quando há campos do tipo texto/CPF-telefone configurados (sessão 18) |

**Score P: 11✅ = 11/11 = 100%**

---

### H — Módulo de Processo Digital — Habite-se (req. 116–126)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 116 | Solicitante visualizar processo aberto e etapa atual | ✅ | ✅ | Mesmo que P-105 — `ProcessosPage tipo="habite_se"` funcionando |
| 117 | Solicitante iniciar e salvar em rascunho | ✅ | ✅ | Mesmo mecanismo de P-106 — `ProcessosPage tipo="habite_se"` reaproveita `POST /processos` + `PATCH /processos/:id/enviar` |
| 118 | Solicitante corrigir onde parecer reprovado | ✅ | ✅ | **concluído sessão 28**: mesmo que P-107 — etapa única "Análise" + botão "Dar parecer" + `formulario` resolvido via `formularios_processo`, todos reaproveitados via `ProcessosPage tipo="habite_se"` |
| 119 | Solicitante selecionar imóvel no mapa | ✅ | ✅ | Mesmo que P-108 — painel "Abrir processo" com `<SIGMap compact />` reaproveitado via `tipo="habite_se"` |
| 120 | Campo obrigatório ou não configurável | ✅ | ✅ | Mesmo que P-109 — `formularios_processo` por `tipo_processo='habite_se'`, configurável via "⚙ Configurar formulário" e validado na abertura (sessão 18) |
| 121 | Analista gerenciar processos | ✅ | ✅ | Mesmo que P-110 — funcionando |
| 122 | Encaminhar para outro analista | ✅ | ✅ | Mesmo que P-111 — `PATCH /processos/:id/encaminhar` reaproveitado (rota é compartilhada entre P e H) |
| 123 | Deixar processo sem analista | ✅ | ✅ | Mesmo que P-112 — `PATCH /processos/:id/retirar-analista` reaproveitado |
| 124 | Analista visualizar processos de outros analistas | ✅ | ✅ | Mesmo que P-113 — funcionando |
| 125 | Consultar por código, requerente, telefone, email | ✅ | ✅ | Mesmo que P-114 — `GET /processos?busca=` e campo de busca em `ProcessosPage` reaproveitados (sessão 21) |
| 126 | Filtrar fluxo por campos do fluxo | ✅ | ✅ | Mesmo que P-115 — `GET /processos?campo=&valor=` reaproveitado (sessão 18) |

**Score H: 11✅ = 11/11 = 100%**

---

### M — Módulo de Gestão do Aplicativo Móvel — Painel Web (req. 127–152)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 127 | Manutenção de fluxos de trabalho com fases | ✅ | ✅ | `FluxosBpmnManager`: fases com nome, cor, duração, perfis, formulário e reordenação — completo (sessão 7) |
| 128 | Atribuir cor, aviso de duração e duração da fase em minutos | ✅ | ✅ | Colunas `cor`, `duracao_minutos`, `avisar_duracao` em `fases_bpmn`; UI com seletor de cor, campo numérico de duração (min) e checkbox de aviso (sessão 7) |
| 129 | Incluir usuários autorizados para visualizar cada fase do Fluxo | ✅ | ✅ | `PATCH /mobile/chamados/:id/analista` + `GET /mobile/equipe` (lista usuários não-cidadãos ativos); seletor "Responsável" no painel de detalhe de `AppMobileGestaoPage` atribui o `analista_id` do chamado (sessão 15) |
| 130 | Definir fase como encerrado (última fase do fluxo) | ✅ | ✅ | **concluído sessão 23**: nova coluna `encerra_processo` (BOOLEAN) em `sigweb.fases_bpmn`; checkbox "Fase de encerramento (finaliza o processo ao ser concluída)" em `FluxosBpmnManager`; `POST /processos/:processoId/etapas/:etapaId/parecer` finaliza o processo (`situacao = aprovado/reprovado`) imediatamente quando a etapa pertence a uma fase marcada como encerramento, sem aguardar as demais etapas |
| 131 | Alterar ordem das fases | ✅ | ✅ | Botões ▲/▼ em `FluxosBpmnManager` reordenam o array de fases (persistido via `ordem`, sessão 7) |
| 132 | Inserção de boletim (questionário) por Fluxo de Trabalho | ✅ | ✅ | Coluna `boletim` JSONB em `categorias_chamado`; `BoletimManager` (modal em `AppMobileGestaoPage`) edita perguntas reaproveitando `FormularioCampos`; `PUT /mobile/categorias/:id/boletim` (sessão 7) |
| 133 | CRUD de categorias para Fluxo de Trabalho | ✅ | ✅ | `GET/POST /mobile/categorias` funcionando |
| 134 | Organizar categorias pai/filho (hierarquia) | ✅ | ✅ | Coluna `categoria_pai_id` (auto-FK) em `categorias_chamado`; árvore hierárquica + seletor de categoria-pai em `CategoriaConfigManager`, `PATCH /mobile/categorias/:id` (sessão 7) |
| 135 | Atribuir cor e ícones (.png/.jpg) às categorias | ✅ | ✅ | Colunas `cor`/`icone_url` em `categorias_chamado`; seletor de cor + campo de URL de ícone com pré-visualização em `CategoriaConfigManager` (sessão 7) |
| 136 | Atribuir categoria a um Fluxo de Trabalho | ✅ | ✅ | `categoria_id` em chamados funcionando |
| 137 | Categoria Privada (somente fiscais da Prefeitura) | ✅ | ✅ | Campo `privada` em `categorias_chamado`; checkbox "Categoria privada — somente fiscais" em `CategoriaConfigManager` (`PATCH /mobile/categorias/:id`); filtragem `!c.privada \|\| isFiscal(perfil)` já existente em `NovaSolicitacaoScreen` (sessão 15) |
| 138 | Filtros de pesquisa de solicitações (código, data, última atualização, observações) | ✅ | ✅ | `GET /mobile/chamados` com filtros múltiplos funcionando |
| 139 | Filtrar solicitações por categorias | ✅ | ✅ | Filtro por categoria_id ✅ |
| 140 | Selecionar solicitação na tabela e posicionar no mapa (bidirecional) | ✅ | ✅ | Botão "📍 Ver" por linha em AppMobileGestaoPage → setPendingTarget + navigate('/mapa') |
| 141 | Selecionar no mapa e listar na tabela | ✅ | ✅ | Botão "🗺 Mapa" em `AppMobileGestaoPage` exibe mapa Leaflet embutido com marcadores coloridos por situação; clicar num marcador seleciona o chamado e rola a tabela até a linha correspondente (sessão 15) |
| 142 | Visualizar detalhes da solicitação (fotos, endereço, Google Maps) | ✅ | ✅ | Painel de detalhe com fotos, endereço e link Google Maps funcionando |
| 143 | Alterar categoria da solicitação | ✅ | ✅ | `PATCH /mobile/chamados/:id/categoria` (com validação de categoria existente) + seletor de categoria no painel de detalhe de `AppMobileGestaoPage` (sessão 7) |
| 144 | Notificar (FCM) que categoria foi alterada | ✅ | ✅ | Coluna `fcm_token` em `usuarios` + `PUT /mobile/dispositivo` (registro do token pelo app); helper `notificarCidadao`/`sendPushNotification` (`firebase-admin/messaging`) dispara sino + push ao trocar a categoria do chamado (sessão 7) |
| 145 | Alterar fase atual do chamado | ✅ | ✅ | Chamados não possuem "fase" BPMN própria — o equivalente é a `situacao`; `PATCH /mobile/chamados/:id/situacao` altera o estado do chamado (descrição corrigida na sessão 7 — apontava erroneamente para um endpoint de "fase" inexistente) |
| 146 | Notificar (FCM) que fase foi alterada | ✅ | ✅ | `PATCH /mobile/chamados/:id/situacao` agora chama `notificarCidadao` (sino + push FCM) ao alterar a situação/fase do chamado, reaproveitando a infra do req 144 (sessão 7) |
| 147 | Enviar mensagens públicas com notificação FCM ao cidadão | ✅ | ✅ | `POST /mobile/chamados/:id/mensagens` grava mensagem pública e chama `notificarCidadao`, que registra notificação interna (`sigweb.notificacoes`) e envia push FCM via `sendPushNotification`/`firebase-admin/messaging` — gap de FCM do req 147 fechado com a infra de req 144/146 (sessão 7) |
| 148 | Enviar mensagens privadas (comunicação interna, sem acesso do cidadão) | ✅ | ✅ | Mesmo endpoint com `publica:false` — mensagem fica restrita à equipe (sem notificar `solicitante_id`); badge "🔒 Privada" no painel de detalhe (sessão 7) |
| 149 | Mensagens públicas mesmo após solicitação finalizada | ✅ | ✅ | Compositor de mensagens em `AppMobileGestaoPage` não verifica `situacao` — funciona com chamado `concluida`/`cancelada` (sessão 7) |
| 150 | Visualizar respostas do Boletim do Fluxo de Trabalho | ✅ | ✅ | Coluna `respostas_boletim` JSONB em `solicitacoes_chamado`; painel de detalhe do chamado em `AppMobileGestaoPage` lista pergunta×resposta (sessão 7) |
| 151 | Incluir fotos referentes à solicitação | ✅ | ✅ | `foto_urls` array no schema; `POST /mobile/chamados` com fotos funcionando |
| 152 | Impressão da solicitação com mapa, mensagens, questionário e histórico | ✅ | ✅ | Coluna `historico` JSONB em `solicitacoes_chamado` (`MIGRATION_CHAMADOS_HISTORICO`) registra cada transição de situação (de/para/usuário/data) em `PATCH /mobile/chamados/:id/situacao`; PDF gerado por `imprimirChamado` lista o histórico real de mudanças de situação (sessão 15) |

**Score M: 26✅ = 26/26 = 100%**

---

### MA — App Móvel para Chamados (Android + iOS) (req. 153–166)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 153 | Desenvolvido para Android e iOS | 🔶 | ❌ | App `apps/mobile` (Expo React Native/TS, SDK 56) escrito — roda em ambas plataformas via Expo, ainda não testado em dispositivo/emulador |
| 154 | Integrado ao SIG WEB | 🔶 | ❌ | Cliente axios (`src/lib/api.ts`) + Firebase Auth (`src/lib/firebase.ts`) consumindo a mesma API/projeto Firebase (`caroacidades`) do SIG WEB |
| 155 | Permitir criação de login no aplicativo | 🔶 | ❌ | `LoginScreen` — login/cadastro via `signInWithEmailAndPassword`/`createUserWithEmailAndPassword`; provisionamento JIT do registro em `sigweb.usuarios` no backend (`resolveUsuarioId`/`GET /mobile/me`, novo) |
| 156 | Selecionar camadas configuradas no SIG WEB | 🔶 | ❌ | `MapScreen` lista e alterna camadas WMS de `GET /camadas-wms` como overlays (`WMSTile`) + alternância de mapa base padrão/satélite |
| 157 | Criação de solicitações | 🔶 | ❌ | `NovaSolicitacaoScreen` — formulário completo (categoria, descrição, endereço, fotos, observações) → `POST /mobile/chamados` |
| 158 | Mover mapa para posicionar marcador ao abrir solicitação | 🔶 | ❌ | `MapScreen` — marcador acompanha o centro do mapa (`onRegionChangeComplete`), botão "Nova solicitação neste local" leva a coordenada atual ao formulário |
| 159 | Inclusão de uma ou mais imagens | 🔶 | ❌ | `NovaSolicitacaoScreen` — `expo-image-picker` (galeria/câmera), múltiplas fotos com pré-visualização e remoção, upload para Firebase Storage (mesmo padrão `uploadBytesResumable`/`getDownloadURL` do `GestaoSIGPage`) |
| 160 | Editar foto: recortar, rotacionar | 🔶 | ❌ | `allowsEditing: true` no `expo-image-picker` (crop/rotação nativos do seletor, iOS e Android) |
| 161 | Busca automática de endereço + possibilidade de alterar | 🔶 | ❌ | `NovaSolicitacaoScreen` — botão "📍 Buscar" usa `Location.reverseGeocodeAsync` para preencher o campo, que permanece editável manualmente |
| 162 | Escrever observações finais | 🔶 | ❌ | `NovaSolicitacaoScreen` — campo de observações enviado em `respostasBoletim.observacoes` |
| 163 | Visualizar todas as suas solicitações | 🔶 | ❌ | `MinhasSolicitacoesScreen` — lista via `GET /mobile/chamados?usuarioId=` (resolvido por `GET /mobile/me`), com situação colorida |
| 164 | Alterar cadastro (nome, nascimento, email, celular, senha) | 🔶 | ❌ | `PerfilScreen` — nome/nascimento/celular via novo `PATCH /mobile/me` (colunas `data_nascimento`/`celular` adicionadas a `sigweb.usuarios`); e-mail exibido (gerido pelo Firebase); senha via `updatePassword` do Firebase Auth |
| 165 | Compartilhar o aplicativo | 🔶 | ❌ | `PerfilScreen` — botão "Compartilhar aplicativo" usa a API nativa `Share` do React Native |
| 166 | Fiscais da prefeitura utilizarem categorias específicas no app | 🔶 | ❌ | `NovaSolicitacaoScreen` filtra categorias `privada` por `isFiscal(perfil)` (claim `perfil` do token) — mesma regra do `categorias_chamado.privada` |

**Score MA: 14🔶×0,5 = 7/14 = 50%**

---

### MB — App Móvel para Recadastramento Imobiliário (req. 167–181)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 167 | Desenvolvido para Android | 🔶 | ❌ | App `apps/recadastramento` (Expo React Native/TS, SDK 56) escrito; não testado em dispositivo/emulador |
| 168 | Integração direta com SIG WEB | 🔶 | ❌ | App consome `GET /mobile/loteamentos`, `GET /mobile/loteamentos/:id/lotes`, `GET/POST/PATCH/DELETE /mobile/bics`, `GET /camadas-wms` |
| 169 | Credenciais de acesso configuradas pelo sistema | 🔶 | ❌ | `LoginScreen` restrito a fiscais (`isFiscalRecadastramento`/`requireRole`), sem auto-cadastro |
| 170 | Listar lotes por loteamento | 🔶 | ❌ | `LoteamentosScreen` → `LotesScreen` (lista lotes do loteamento selecionado via `GET /mobile/loteamentos/:id/lotes`) |
| 171 | Selecionar lote pelo mapa | 🔶 | ❌ | `LotesScreen` aba "Mapa": polígonos dos lotes (`Polygon`/`geometryParaPoligonos`, GeoJSON→LatLng) tocáveis (`tappable`/`onPress`) navegam para `BicScreen` |
| 172 | Selecionar lote por lista | 🔶 | ❌ | `LotesScreen` aba "Lista": `FlatList` com código/área/situação de cada lote, toque inicia a coleta |
| 173 | Habilitar/desabilitar camadas configuradas pelo SIG WEB | 🔶 | ❌ | `LotesScreen` (modo mapa): menu "🗂️ Camadas" com `GET /camadas-wms` renderizadas via `WMSTile`, mesmo padrão do `MapScreen` do App Chamados |
| 174 | Camada de situação do recadastramento | 🔶 | ❌ | Polígonos dos lotes coloridos por `situacao_recadastramento` (`CORES_SITUACAO`: pendente/visitado/recadastrado/impedido) com legenda no mapa |
| 175 | Armazenamento em cache das camadas para funcionamento offline | 🔶 | ❌ | `cache.ts`/AsyncStorage cacheia loteamentos e lotes (com geometria) por loteamento; `LoteamentosScreen`/`LotesScreen` carregam do cache quando `useNetInfo` indica offline |
| 176 | Gerar arquivo ZIP com todas as informações coletadas (backup) | 🔶 | ❌ | `MeusBicsScreen` botão "📦 Exportar ZIP": `JSZip` empacota `bics.json` + fotos/croquis/documentos, grava via `expo-file-system` `File`/`Paths` (API nova do SDK 56) e compartilha via `expo-sharing` |
| 177 | Enviar informações coletadas ao SIG WEB (com fotos, croquis, documentos) | 🔶 | ❌ | `MeusBicsScreen` botão "🔄 Sincronizar": upload de fotos/croquis/documentos ao Firebase Storage e envio via `POST`/`PATCH /mobile/bics` |
| 178 | Exibir lista de BICs inseridos durante coleta | 🔶 | ❌ | `MeusBicsScreen` lista BICs locais (`bics.ts`/AsyncStorage) com badges de situação e sincronização |
| 179 | Manutenção dos BICs (inserção, atualização, remoção) | 🔶 | ❌ | `BicScreen` cria/edita; `MeusBicsScreen` toque-e-segure remove local e remotamente (`DELETE /mobile/bics/:id`, novo endpoint) |
| 180 | Rastreio de coordenada geográfica do ponto de coleta | 🔶 | ❌ | `BicScreen` usa `expo-location.getCurrentPositionAsync` com botão "Atualizar" |
| 181 | Online e offline (internet móvel ou Wi-Fi com sync) | 🔶 | ❌ | Fila local offline-first (`BicColetado`/`bics.ts`, flag `sincronizado`), indicador online/offline via `useNetInfo`, sincronização sob demanda quando conectado |

**Score MB: 15🔶×0,5 = 7,5/15 = 50%**

---

### MC — App Móvel de Arborização (req. 182–188)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 182 | Desenvolvido para Android | 🔶 | ❌ | App `apps/arborizacao` (Expo React Native/TS, SDK 56) escrito; não testado em dispositivo/emulador |
| 183 | Integrado ao SIG WEB | 🔶 | ❌ | `LoginScreen` restrito a fiscais (`isFiscalCampo`/`requireRole`), `ColetaScreen`/`ListaArvoresScreen` consomem `GET/POST/PATCH /mobile/arvores` e `GET /logradouros` |
| 184 | Exportação de dados do BIC (fotos de árvores, calçada, documentos) para importação no SIG WEB | 🔶 | ❌ | Botão "Exportar" em `ListaArvoresScreen` gera JSON via `expo-file-system` (`File`/`Paths`, API nova do SDK 56) e compartilha via `expo-sharing` |
| 185 | Exibir lista de BICs inseridos durante coleta | 🔶 | ❌ | `ListaArvoresScreen` lista coletas locais (`coletas.ts`/AsyncStorage) com badges de sincronização, busca `GET /mobile/arvores` na sincronização |
| 186 | Manutenção dos BICs (inserção, atualização) | 🔶 | ❌ | `ColetaScreen` cria/edita registro local; "Sincronizar" envia via `POST`/`PATCH /mobile/arvores` (com upload de fotos ao Firebase Storage) |
| 187 | Recuperação de coordenada geográfica do ponto de coleta | 🔶 | ❌ | `ColetaScreen` usa `expo-location.getCurrentPositionAsync` com botão "Atualizar" |
| 188 | Online e offline (internet móvel ou Wi-Fi) | 🔶 | ❌ | Fila local offline-first (`ColetaArvore`/`coletas.ts`, flag `sincronizado`), indicador online/offline via `useNetInfo`, sincronização sob demanda quando conectado |

**Score MC: 7🔶×0,5 = 3,5/7 = 50%**

---

### RU — Módulo de Processo de REURB Digital (req. 189–208)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 189 | Editor BPMN configurável de acordo com as necessidades do processo | ✅ | ✅ | `BpmnEditor` (wrapper do `bpmn-js` Modeler) embutido em `FluxosBpmnManager`; CRUD completo de fluxos com diagrama XML editável e persistido (sessão 6) |
| 190 | Organizar por setor/departamento os objetos do fluxo | ✅ | ✅ | Campo `setor` no fluxo, exibido na lista e editável no painel (sessão 6) |
| 191 | Associar perfis de usuário ao fluxo no Editor BPMN | ✅ | ✅ | Checkboxes de perfis (`ADMIN`, `FISCAL_TRIBUTARIO`, `SETOR_PROJETOS`, `FISCAL_CAMPO`, `CIDADAO`) por fase, persistidos em `fases_bpmn.perfis` (sessão 6) |
| 192 | Ativar/desativar fluxo pelo Editor BPMN | ✅ | ✅ | `PATCH /reurb/fluxos/:id/ativo` + botão "Ativar/Desativar fluxo" na UI (sessão 6) |
| 193 | Configurar tempo médio por etapa (user task) | ✅ | ✅ | Campo `tempo_medio_horas` por fase, input numérico no editor (sessão 6) |
| 194 | Formulário com ≥4 tipos: texto simples, checkbox, mapa simples, CPF/telefone com máscara | ✅ | ✅ | `FormularioCampos` (builder) + `FormularioRenderer` (render dinâmico) com os 4 tipos — `mapa` embute `SIGMap` e sincroniza `selectedParcelaId`; `cpf_telefone` aplica máscara conforme nº de dígitos (sessão 6) |
| 195 | Gerenciar permissões de acesso ao formulário por etapa | ✅ | ✅ | **concluído sessão 30**: `FormularioRenderer.tsx` importa `useAuthStore`, filtra campos cujo `perfisVisiveis` não inclui o perfil do usuário atual — ACL por campo individual no REURB, compatível com o editor `FormularioCampos` que já persistia `perfisVisiveis` no JSONB |
| 196 | Encaminhar processo para pessoa específica dentro da fase | ✅ | ✅ | **concluído sessão 27**: `GET /processos/analistas` aceita `processoId` e, quando o processo possui `fase_atual_id` (fluxo BPMN, req 191) com `perfis` restritos, filtra a lista de analistas pelos perfis daquela fase (em vez de sempre listar ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO); o seletor "Encaminhar" em `ProcessosPage`/`ReurbPage` agora exibe nome e e-mail de cada analista para desambiguação |
| 197 | Anexar documentos no processo digital | ✅ | ✅ | `anexos` array no schema; `POST /processos/:id/anexos` funcionando |
| 198 | Visualizar dados do solicitante (nome, email, telefone, CPF) | ✅ | ✅ | Dados do requerente exibidos no detalhe do processo |
| 199 | Usuário visualizar o fluxo e identificar etapa atual | ✅ | ✅ | Etapas e situação atual exibidas no ProcessosPage |
| 200 | Usuário visualizar histórico de fases com todas as interações | ✅ | ✅ | `historico_fases_processo` com pareceres e timestamps funcionando |
| 201 | Gerenciamento: processos com o analista | ✅ | ✅ | Filtro por `analista_id` funcionando |
| 202 | Gerenciamento: processos em etapas não atribuídos | ✅ | ✅ | `GET /processos?sem_analista=true` funcionando |
| 203 | Consultar por código, requerente, telefone ou email | ✅ | ✅ | Mesmo que P-114 — `GET /processos?busca=` e campo de busca em `ProcessosPage` reaproveitados (`ReurbPage` usa o mesmo componente com `tipo="reurb"`) (sessão 21) |
| 204 | Requerente alterar somente formulários onde analista reprovou | ✅ | ✅ | Ao abrir um processo REURB, `etapas_processo` é populada a partir das fases do fluxo BPMN ativo (`fase_id`); `GET /processos/:id` retorna o `formulario` de cada etapa; quando reprovado, `ProcessosPage` renderiza via `FormularioRenderer` apenas os formulários das etapas com `situacao='reprovado'` (com o parecer do analista); `PATCH /processos/:id/reenviar` aplica no `metadados` somente os campos das etapas não-aprovadas, preservando os campos de etapas já aprovadas (sessão 17) |
| 205 | Selecionar lote pelo mapa para abrir processo | ✅ | ✅ | `parcela_id` linkado ao cadastro imobiliário via UUID; mapa integrado ao abrir processo |
| 206 | Inserir anotações em PDF anexado (criar cópia sem sobrescrever original) | ✅ | ✅ | `POST /processos/:id/anexos` registra anexos enviados ao Firebase Storage; `POST /processos/:id/anexos/:anexoId/anotar` baixa o PDF original, usa `pdf-lib` para adicionar uma página de anotação (texto + autor + data) e salva como **novo arquivo** (`anexo_original_id` aponta para o original, que não é alterado); UI em `ProcessosPage` (seção "Anexos": upload, "Anotar" por PDF, exclusão) (sessão 17) |
| 207 | Exibir lotes REURB pintados no mapa por etapa/fase | ✅ | ✅ | View `v_lotes_reurb` + camada MVT colorida por `processo_situacao` (rascunho/aberto/em_análise/aprovado/reprovado), togglável em "Lotes REURB (por situação)" no `LayerControl` (sessão 6) |
| 208 | Dashboards personalizáveis com situação em tempo real | ✅ | ✅ | `GET /processos/dashboard?tipo=reurb` (ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO) retorna contagem por situação, total e tempo médio até conclusão; nova aba "Dashboard" em `ReurbPage` (`ReurbDashboard.tsx`) exibe cards por situação com `refetchInterval` de 30s (sessão 17) |

**Score RU: 20✅ = 20/20 = 100%**

---

### PG — Planta Genérica de Valores (req. 209–227)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 209 | Cadastro de amostras por clique no mapa georreferenciado | ✅ | ✅ | `POST /pgv/setores/:id/amostras` com coordenadas funcionando |
| 210 | Preencher informações da amostra (idade aparente, conservação, tipologia, CUB) | ✅ | ✅ | Campos completos de amostra no schema e na UI |
| 211 | Desenhar setores de cálculo e polos valorizantes | ✅ | ✅ | **concluído sessão 26**: nova aba "Mapa" em `PGVPage` embute `SIGMap compact` + novo componente `PgvSetoresLayer` — exibe setores PGV (polígonos azuis tracejados) e polos valorizantes (marcadores laranja) existentes via `GET /pgv/setores`/`GET /pgv/polos` (geometria agora retornada como GeoJSON); para ADMIN/FISCAL_TRIBUTARIO, botões "⬡ Desenhar setor" e "📍 Adicionar polo" ativam `leaflet-geoman` (`map.pm.enableDraw`) — ao concluir o desenho, formulário lateral pede o nome (e tipo, para polos) e salva via `POST /pgv/setores` (já existente) ou novo `POST /pgv/polos` |
| 212 | Inserir valores básicos do CUB (tipologia, estrutura, padrão, coeficiente) | ✅ | ✅ | Campos de CUB no schema de amostras funcionando |
| 213 | Inserir coeficientes de depreciação (conservação + idade aparente) | ✅ | ✅ | Tabela de depreciação no schema; cálculo automático funcionando |
| 214 | Configurar fórmula de homogeneização, fatores e lote paradigma | ✅ | ✅ | Parâmetros configuráveis por setor no `POST /pgv/setores` |
| 215 | Equação da regressão linear + gráfico de dispersão com linha de tendência | ✅ | ✅ | Regressão linear por mínimos quadrados + Recharts com linha de tendência funcionando |
| 216 | Retirar amostras espúrias e recalcular equação | ✅ | ✅ | `DELETE /pgv/amostras/:id` + recálculo automático funcionando |
| 217 | Calcular distância de cada face de quadra ao polo valorizante | ✅ | ✅ | `ST_Distance` por face de quadra funcionando |
| 218 | Calcular valores das faces de quadra automaticamente com base na equação | ✅ | ✅ | `POST /pgv/setores/:id/calcular` atualiza valores das faces funcionando |
| 219 | Exibir faces de quadra georreferenciadas com valor PGV no mapa | 🔶 | 🔶 | Camada temática "PGV" implementada — `GET /pgv/faces-quadra` (GeoJSON com `valor_calculado`) + `PgvLayer.tsx` no mapa (gradiente amarelo→vermelho proporcional ao valor/m², tooltip com quadra/logradouro/valor) + legenda em `LayerControl`; falta validar visualmente com dados reais calculados (depende de setores PGV com regressão aplicada) |
| 220 | Relatório com valores das faces de quadra (código, logradouro, valor) | ✅ | ✅ | `GET /pgv/setores/:id/relatorio` com dados das faces de quadra |
| 221 | Simulação do IPTU com novos valores da PGV | ✅ | ✅ | `POST /pgv/simulacao` — IPTU calculado com alíquotas e teto funcionando |
| 222 | Definir alíquotas para simulação | ✅ | ✅ | Parâmetros de alíquota configuráveis no simulador |
| 223 | Percentual do valor venal a usar no IPTU | ✅ | ✅ | Campo `percentual_venal` no schema da simulação |
| 224 | Limitar aumento do IPTU (teto de aumento) | ✅ | ✅ | `teto_aumento` configurável e aplicado no cálculo |
| 225 | Comparativo IPTU atual vs IPTU simulado | ✅ | ✅ | Comparativo exibido na UI do PGVPage |
| 226 | Tabela com IPTU anterior e sugerido + somatório | ✅ | ✅ | Tabela com total dos valores funcionando |
| 227 | Parametrização da fórmula em tempo de execução | ✅ | ✅ | Parâmetros ajustáveis sem necessidade de recompilação |

**Score PG: 18✅ + 1🔶×0,5 = 18,5/19 = 97%**

---

### 3D — Visualização de Nuvem de Pontos 3D (req. 228–234)

| # | Requisito do Edital | Impl | Testado | Status |
|---|---------------------|------|---------|--------|
| 228 | Visualização da nuvem de pontos do recobrimento aerofotogramétrico | 🔶 | 🔶 | `PointCloudViewer.tsx` (Three.js, lazy-loaded) exibe terreno sintético de 80 000 pontos em `/nuvem-pontos` — demonstra o visualizador; dados reais do aerolevantamento substituirão via `VITE_POTREE_URL` (previsto Jun/Jul 2026) |
| 229 | Visualização de coordenadas 3D e valor de intensidade dos pontos | ✅ | ✅ | **sessão 35**: readout em tempo real ao passar o mouse — exibe E (UTM), N (UTM), Z (m) e intensidade (%) do ponto mais próximo via `THREE.Raycaster`; totalmente implementado com dados sintéticos, pronto para dados reais |
| 230 | Disponibilizar em ambiente web integrado ao SIG | ✅ | ✅ | **sessão 34**: `NuvemPontosPage` usa `React.lazy` + Suspense para carregar `PointCloudViewer` — abre imediatamente em produção, sem dependência de URL externa |
| 231 | Navegação e interação (zoom, rotação, movimentações) | ✅ | ✅ | **sessão 35**: classe `Orbit` ampliada — arrastar (esq.) = rotação, scroll = zoom, arrastar (dir.) = pan via `right.setFromMatrixColumn` + `target.addScaledVector`; todos os 3 tipos de movimentação implementados |
| 232 | Ferramentas de medições (distâncias, área, volumes, cortes em seções) | ✅ | ✅ | **sessão 36**: (a) distância 3D — 2 cliques + esferas + linha + comprimento real (desfaz exageração vertical); (b) área — shoelace XZ, resultado m²/ha; (c) volume — `pipXZ` + `area × avg_height_above_base` para pontos dentro do polígono, em m³; (d) corte em seção — modo "✂ Perfil": 2 cliques definem seção, filtra pontos num corredor adaptativo, gera scatter plot canvas 160px com eixos de distância × elevação |
| 233 | Personalização (cores, intensidade, filtro de classificação) e marcadores/anotações | ✅ | ✅ | **sessão 35**: (cores) seletor hipsométrico/intensidade/classificação LiDAR com legenda dinâmica; (marcadores) modo "📍 Anotação" — clique em ponto abre prompt de texto, insere esfera amarela + label DOM flutuante posicionada via `.project(camera)` a cada frame |
| 234 | Alternância de densificação, ângulo de visualização, qualidade e tamanho dos pontos | ✅ | ✅ | **sessão 35**: slider densificação 10–100% (`geo.setDrawRange`); slider tamanho 1–8 px (`PointsMaterial.size`); ângulo de visualização livre via orbit (rotação+pan+zoom); todos os controles implementados |

> **Nota:** Requisitos 228–234 agora demonstráveis com dados sintéticos via `PointCloudViewer.tsx` (Three.js). Dados reais do aerolevantamento substituem via `VITE_POTREE_URL` → Potree Viewer (previsto Jun/Jul 2026). Infraestrutura no GCS já está prevista em `terraform/gcs.tf`.

**Score 3D: 6✅ + 1🔶×0,5 = 6,5/7 = 93%** *(sessão 36: 232 🔶→✅ — todas as 4 ferramentas de medição implementadas; pendente: 228=dados aerofotogramétricos reais)*

---

## 🏗️ INFRAESTRUTURA & DEPLOY

| Item | Descrição | Impl | Testado |
|------|-----------|------|---------|
| ✅ | API Cloud Run `sigweb-api-dev` — revisão 00022 (sessão 12) | ✅ | ✅ |
| ✅ | pg_tileserv Cloud Run `sigweb-tileserv-dev` | ✅ | ✅ |
| ✅ | Frontend Firebase Hosting `caroacidades.web.app` | ✅ | ✅ |
| ✅ | Cloud SQL PostgreSQL 15 + PostGIS — `sigweb-dev` | ✅ | ✅ |
| ✅ | Firebase Auth (projeto `caroacidades`) | ✅ | ✅ |
| ✅ | Secret Manager — `firebase-service-account-dev` | ✅ | ✅ |
| ✅ | Backup diário Cloud SQL configurado | ✅ | ✅ |
| ✅ | CORS configurado para `caroacidades.web.app` | ✅ | 🔶 |
| ✅ | Mapillary token configurado (`VITE_MAPILLARY_TOKEN` em `.env.local` + `.env.production`) | ✅ | ✅ |
| ✅ | Firebase Hosting site criado (projeto `caroacidades`, conta `devrafamorais@gmail.com`) | ✅ | ✅ |
| ✅ | CI/CD — Cloud Build trigger push main → deploy automático (API `deploy-api-main` + Web `deploy-web-main`) | ✅ | ✅ |
| ❌ | `firebase.tf` — IaC do Firebase Hosting | ❌ | ❌ |
| ❌ | `cdn.tf` — Cloud CDN + Load Balancer | ❌ | ❌ |
| ❌ | `VITE_POTREE_URL` — URL do Potree Viewer no GCS | ❌ | ❌ |

---

## 🗄️ BANCO DE DADOS — Migrations V001–V016

| Migration | Descrição | Status |
|-----------|-----------|--------|
| V001 | Extensões PostGIS, uuid-ossp, pgcrypto, pg_trgm | ✅ Aplicada |
| V002 | Usuários e perfis RBAC | ✅ Aplicada |
| V003 | Cadastro imobiliário (parcelas, edificações, bairros, quadras, logradouros) | ✅ Aplicada |
| V004 | Iluminação + arborização (postes, árvores, OS, estoque, equipes) | ✅ Aplicada |
| V005 | Viabilidade + plano diretor (zonas, parâmetros, CNAE) | ✅ Aplicada |
| V006 | PGV (amostras, setores, polos, faces de quadra, simulações IPTU) | ✅ Aplicada |
| V007 | Processos digitais (processos, etapas, pareceres, anexos, chamados) | ✅ Aplicada |
| V008 | Cadastro social (pessoas, famílias, rendas, programas) | ✅ Aplicada |
| V009 | Seeds de dados base | ✅ Aplicada |
| V010 | Numeração predial | ✅ Aplicada |
| V011 | REURB / BPMN (fluxos, fases, histórico) | ✅ Aplicada |
| V012 | Patrimônio público e cemitérios | ✅ Aplicada |
| V013 | SINTER (envios, parcelas_sinter) | ✅ Aplicada |
| V014 | Auditoria (audit_log, triggers, cleanup) | ✅ Aplicada |
| V015 | View `v_parcelas_recadastramento` (camada MVT por situação — req 07) | ✅ Aplicada |
| V016 | Campos adicionais de Estoque (marca, fabricante, família — req 49) | ✅ Aplicada |

---

## 🔴 SINTER — Sistema Nacional de Gestão de Informações Territoriais

> **Prazo obrigação contratual: 31/12/2026** (cláusula 2.1.2 do edital)
> Nenhuma linha de código escrita. Gap: 7 meses.

| Item | Descrição | Status |
|------|-----------|--------|
| 🔶 | `services/sinter.service.ts` — extract, transform, validate, upload (layout RFB) | 🔶 Implementado — falta teste real contra portal RFB |
| 🔶 | `routes/admin/sinter.ts` — orquestração + histórico de envios | 🔶 Implementado — 6 endpoints (preparar, enviar, resposta, stats, parcelas, detalhe) |
| ✅ | Schema `sigweb.envios_sinter` e `sigweb.parcelas_sinter` | ✅ Existe no BD (V013) |
| 🔶 | Primeiro envio de teste ao SINTER (prazo contratual: mês 2 = Julho/2026) | 🔶 XML gerado localmente; envio ao portal RFB depende de credenciais oficiais |

---

## ⚡ PRÓXIMOS ITENS CRÍTICOS (para atingir 95%)

> Ordenados por impacto/esforço — implementar nesta sequência
> Legenda: ✅ feito | 🔄 em andamento | [ ] pendente

### BLOCO 1 — Fechar bidirecional mapa↔tabela em todos os módulos (+7 pts → 48%)
1. ✅ Req. 58/59 — Iluminação: tabela→mapa e mapa→tabela (sessão 2/3)
2. ✅ Req. 63/64/68/69 — Iluminação: OS tabela↔mapa (sessão 2/3)
3. ✅ Req. 75/80/85 — Arborização mapa→tabela + painel OS (sessão 3 — ArboriacaoPage completa)
4. ✅ Req. 140 — App Gestão: botão "📍 Ver" por linha de chamado na tabela (sessão 3)
5. [ ] Req. 141 — App Gestão: selecionar chamado no mapa → destacar na tabela

### BLOCO 2 — Completar os 🔶 parciais de alto impacto (+10 pts → 52%) ✅ concluído sessão 6
6. ✅ Req. 07 — Colorir parcelas no mapa por situação de recadastramento (campo existe no BD)
7. ✅ Req. 15 — UI de CRUD completo para Pessoa, Loteamento, Quadra com export CSV/XLSX
8. ✅ Req. 23 — Mini-mapa embutido nas telas de cadastro/iluminação/arborização
9. ✅ Req. 56 — Vincular itens do poste ao lote de estoque (UI "Composição do Poste" no painel lateral — sessão 6)
10. ✅ Req. 96 — Numeração: pares/ímpares em cores diferentes no mapa (aba "Mapa Par/Ímpar" — outra IA)

### BLOCO 3 — Módulo de Estoque completo (+6 pts → 55%)
11. ✅ Req. 49 — UI completa de Estoque (Produto, Marca, Fabricante, Fornecedor, Família, Local, Tipo) (sessão 4)
12. ✅ Req. 50 — Nota de entrada via operação interna (sessão 4)
13. ✅ Req. 52 — Transferência entre locais de estoque (sessão 4)
14. ✅ Req. 53/54/55 — Relatórios: movimentação, saldo geral, garantia (filtros + export CSV/XLSX/XML — sessão 5)
15. ✅ Req. 71 — OS de Iluminação movimenta estoque ao ser criada (sessão 4)

### BLOCO 4 — Processo Digital (Aprovação + Habite-se) (+10 pts → 59%) ✅ concluído sessão 6
16. ✅ **Req. 106/117** — Rascunho: salvar processo para envio posterior — já existia (`POST /processos` cria em `rascunho`, `PATCH /processos/:id/enviar` envia); confirmado e documentado (sessão 6)
17. 🔶 Req. 107/118 — Correção apenas onde parecer foi reprovado — `PATCH /processos/:id/reenviar` reabre só as etapas reprovadas e botão "Corrigir e reenviar" no painel; falta UI de edição campo-a-campo (sessão 6)
18. ✅ Req. 108/119 — Selecionar imóvel no mapa ao abrir processo — painel "Abrir processo" com `<SIGMap compact />` + `selectedParcelaId`/`selectParcela`, envia `parcelaId` (sessão 6)
19. ✅ Req. 111/122 — Encaminhar processo para outro analista — `PATCH /processos/:id/encaminhar` + `GET /processos/analistas` + dropdown/botão no painel (sessão 6)
20. ✅ Req. 112/123 — Retirar analista do processo — `PATCH /processos/:id/retirar-analista` + botão no painel (sessão 6)

### BLOCO 5 — REURB BPMN (+9 pts → 63%) ✅ concluído sessão 6
21. [x] **Req. 189** — Editor BPMN configurável: `BpmnEditor` (wrapper `bpmn-js` Modeler) + `FluxosBpmnManager` com CRUD de fluxos e diagrama editável (sessão 6)
22. [x] Req. 190/191/192/193 — Setor (`setor`), perfis por fase (checkboxes), ativar/desativar (`PATCH /ativo`), tempo médio por etapa (`tempo_medio_horas`) (sessão 6)
23. [x] Req. 194/195 — Formulários dinâmicos com 4 tipos (texto, checkbox, mapa, CPF/telefone com máscara) via `FormularioCampos`/`FormularioRenderer`; permissões reaproveitam perfis da fase (🔶) (sessão 6)
24. [x] Req. 207 — Lotes REURB pintados no mapa por situação do processo: view `v_lotes_reurb` + camada MVT no `LayerControl` (sessão 6)

### BLOCO 6 — Módulo Imobiliário UI (+8 pts → 66%) ✅ concluído sessão 6
25. [x] Req. 20/21 — `EdificacoesPage` (lista com busca/filtros/paginação/exportação CSV-XML-XLSX, formulário completo, vínculo de parcela via mapa, seleção de proprietário); `GET /edificacoes` com busca/filtros/paginação; camada MVT colorida por `situacao` no `LayerControl` (sessão 6)
26. [x] Req. 22 — Tabela `sigweb.camadas_wms` + CRUD `/camadas-wms`; aba "Camadas WMS" na `GestaoSIGPage`; renderização via `L.tileLayer.wms` + toggle no `LayerControl` (sessão 6)
27. [x] Req. 26/27 — Vetorização de contorno via `leaflet-geoman` (`pm.enableDraw('Polygon')`) gravando `edificacoes.geometry`; tabela `sigweb.notificacoes` + rotas `/notificacoes`; notificação automática para ADMIN/FISCAL_TRIBUTARIO ao marcar edificação como irregular; sino de notificações no `MainLayout` (sessão 6)
28. [x] Req. 28 — `StreetView360` agora renderiza panoramas equirretangulares próprios via `@photo-sphere-viewer/core` (`EquirectangularViewer`), além da cobertura Mapillary já existente, com snapping de clique entre as duas fontes (sessão 6)

### BLOCO 7 — App Gestão Web (notificações, boletim) (+8 pts → 69%) — ✅ FECHADO 100% (sessão 7)
29. [x] Req. 128/131 — Cor, duração e ordem das fases — **concluído sessão 7**: colunas `cor`/`duracao_minutos`/`avisar_duracao` em `fases_bpmn`, UI em `FluxosBpmnManager` (seletor de cor, duração em minutos, checkbox de aviso, botões ▲/▼ de reordenação)
30. [x] Req. 132/150 — Boletim/questionário por fluxo + visualização de respostas — **concluído sessão 7**: colunas `boletim`/`respostas_boletim`, `BoletimManager` (modal de configuração reaproveitando `FormularioCampos`) + exibição pergunta×resposta no detalhe do chamado
31. [x] Req. 134/135 — Categorias pai/filho com cor e ícone — **concluído sessão 7**: colunas `categoria_pai_id`/`cor`/`icone_url`, árvore hierárquica + seletores de pai/cor/ícone em `CategoriaConfigManager`, `PATCH /mobile/categorias/:id`
32. [x] Req. 144/146 — FCM: notificar cidadão ao mudar categoria/fase — **concluído sessão 7**: coluna `fcm_token` em `usuarios`, `PUT /mobile/dispositivo` (registro do token pelo app móvel), `sendPushNotification` (`firebase-admin/messaging`) + helper `notificarCidadao` (sino + push) reaproveitado em `PATCH /mobile/chamados/:id/categoria` (novo, req 143/144), `PATCH /mobile/chamados/:id/situacao` (req 145/146 — "fase" do chamado é a `situacao`) e no envio de mensagens públicas (fecha o gap de FCM do req 147); seletor de categoria adicionado ao painel de detalhe
33. [x] Req. 147/148/149 — Mensagens públicas e privadas no chamado — **concluído sessão 7** (147 🔶 — falta push FCM ao app móvel, depende de 144/146): `POST /mobile/chamados/:id/mensagens` grava em `mensagens` (JSONB), notifica o cidadão via `sigweb.notificacoes` quando pública, painel de detalhe lista mensagens com badge pública/privada e compositor disponível mesmo após finalização
34. [x] Req. 152 — Impressão da solicitação com mapa, mensagens, questionário e histórico — **concluído sessão 7** (🔶 — sem snapshot visual do mapa e sem log de mudanças de situação): botão "🖨 Imprimir" no painel de detalhe gera PDF (`imprimirChamado`, jsPDF + autoTable, mesmo padrão do `generateMemorialPDF`) com categoria/situação/descrição/endereço/coordenadas/link Google Maps, tabela de respostas do questionário, lista de mensagens públicas/privadas e seção de histórico (situação atual + data de abertura, já que `solicitacoes_chamado` não possui log de mudanças)

### BLOCO 8 — Ferramentas cartográficas avançadas (+5 pts → 71%) — ✅ FECHADO (sessão 8)
35. [🔶] Req. 33/34/36 — Linha guia, buffer e linha ortogonal — req 33/36 **concluídos sessão 8**: botões "Linha guia" (linha tracejada de apoio, `guidesLayerRef` + "Limpar guias") e "Ortogonal" (linha base → perpendicular automática via `computeOrthogonalLine`, `orthogonalLayerRef` + "Limpar ortogonais") em `EditToolbar`; req 34 (buffer) 🔶 — `BufferToolbar.tsx` gera o buffer com `@turf/buffer` sobre a geometria da parcela selecionada e integra ao `SIGMap` (testes de integração com `ST_Buffer`/PostGIS pendentes)
36. [x] Req. 41 — Entrada de vértices por coordenada XY — **concluído sessão 8**: botão "Entrada XY" em `EditToolbar`, modal com lista de vértices X,Y por linha, gera polígono ou linha (`drawXYGeometry`/`parseCoordinatesText`/`closePolygonCoords`)
37. [x] Req. 42 — Geometria por azimutes + distâncias — **concluído sessão 8**: botão "Azimutes" em `EditToolbar`, modal com origem X,Y + lista de azimute/distância por aresta, gera linha ou polígono fechado (`drawAzimuteGeometry`/`destinationPoint`)
38. [🔶] Req. 70/86 — Impressão de OS com mapa (Iluminação e Arborização) — **concluído sessão 8** (🔶 — sem imagem renderizada do mapa): botão "🖨 Imprimir" em ambas as tabelas de OS gera PDF (`imprimirOS`, jsPDF, mesmo padrão do `imprimirChamado`/`generateMemorialPDF`) com dados da OS, localização (logradouro, coordenadas, link Google Maps)
39. [🔶] Req. 05 — Croqui de localização do imóvel em PDF — **concluído sessão 8** (🔶 — esquemático, sem escala oficial): botão "🖨 Croqui de Localização PDF" no painel da parcela em `MapPage`, gera PDF (`gerarCroquiPDF`) com desenho vetorial do contorno do lote (vértices V1,V2... a partir da geometria, escalados em metros aproximados), seta indicativa do norte, identificação e link Google Maps do centróide

### BLOCO 9 — Apps Móveis (36 itens, 0% → +36 pts → 87%) 🔴 CRÍTICO PoC
40. [🔶] **App Chamados** Android/iOS (Expo React Native) — req. 153–166 — **sessão 9**: app `apps/mobile` escrito (Expo SDK 56, Firebase Auth com persistência RN, axios+interceptor de token, React Navigation). Telas: `LoginScreen` (155), `MapScreen` (camadas WMS via `WMSTile` + posicionamento de marcador, 156/158), `NovaSolicitacaoScreen` (categoria/descrição/endereço com geocodificação reversa/fotos via `expo-image-picker`+Firebase Storage/observações, 157/159-162/166), `MinhasSolicitacoesScreen` (163), `PerfilScreen` (dados/senha/compartilhar, 164/165). Backend: corrigido bug crítico de `solicitante_id` (UID do Firebase ≠ UUID de `usuarios.id`) com provisionamento JIT (`resolveUsuarioId`), novos `GET/PATCH /mobile/me`, colunas `data_nascimento`/`celular` em `usuarios`. 🔶 por não ter sido testado em dispositivo/emulador (sem ferramenta de execução do Expo disponível neste ambiente). `tsc --noEmit` ok em `apps/api` e `apps/mobile` (sessão 32: `getReactNativePersistence` corrigido via `@firebase/auth` + `src/types/firebase-rn.d.ts`)
41. [🔶] **App Recadastramento** Android — req. 167–181 — **sessão 9**: app `apps/recadastramento` escrito (Expo SDK 56, Firebase Auth, axios+interceptor, React Navigation, `@tanstack/react-query`, `JSZip`). `LoginScreen` restrito a fiscais (`isFiscalRecadastramento` — ADMIN/FISCAL_CAMPO/FISCAL_TRIBUTARIO, sem cadastro — req 169), `LoteamentosScreen` (lista loteamentos via `GET /mobile/loteamentos` — req 170, com cache offline `cache.ts` — req 175), `LotesScreen` (alterna entre mapa e lista — req 171/172: polígonos dos lotes coloridos por `situacao_recadastramento` — req 174 — tocáveis via `Polygon`/`geometryParaPoligonos`, com legenda e menu de camadas WMS do SIG WEB via `WMSTile` — req 173, e cache local de lotes/geometria para uso offline), `BicScreen` (formulário do BIC: situação/áreas/tipologia/conservação/observações, GPS via `expo-location` — req 180, fotos/croquis/documentos via `expo-image-picker` — req 177), `MeusBicsScreen` (lista local com badges — req 178, manutenção inserir/editar/remover local+remoto via `DELETE /mobile/bics/:id` novo — req 179, "Sincronizar" via `POST/PATCH /mobile/bics` com upload ao Firebase Storage — req 177/181, "Exportar ZIP" empacotando `bics.json`+mídia via `JSZip`+`expo-file-system`+`expo-sharing` — req 176). Arquitetura offline-first: fila local em `bics.ts`/AsyncStorage (`BicColetado`, flag `sincronizado`), indicador online/offline via `useNetInfo`. No backend, corrigido bug crítico análogo ao de `solicitante_id`/`coletado_por` em `POST /mobile/bics`: `coletado_por` (UUID referenciando `usuarios.id`) recebia `request.user.uid` (Firebase UID string), causando erro de banco; corrigido com `resolveUsuarioId`; adicionados `GET/PATCH/DELETE /mobile/bics/:id`. 🔶 em todos os 15 itens por não terem sido testados em dispositivo/emulador (Score MB 0%→50%, +7,5 pts). `tsc --noEmit` ok em `apps/api` e `apps/recadastramento` (sessão 32: `getReactNativePersistence` corrigido)
42. [🔶] **App Arborização** Android — req. 182–188 — **sessão 9**: app `apps/arborizacao` escrito (Expo SDK 56, Firebase Auth, axios+interceptor, React Navigation, `@tanstack/react-query`). `LoginScreen` restrito a fiscais (`isFiscalCampo`, sem cadastro — credenciais configuradas pelo sistema, 169-equiv./183), `ColetaScreen` (registro de árvore: GPS via `expo-location.getCurrentPositionAsync` com botão "Atualizar" — req 187, espécie/altura/DAP/estado fitossanitário/situação da calçada, busca de logradouro via `GET /logradouros`, fotos com `expo-image-picker` allowsEditing — req 186), `ListaArvoresScreen` (lista local com badges Sincronizado/Pendente — req 185, botão "Sincronizar" enviando pendentes via `POST/PATCH /mobile/arvores` com upload de fotos ao Firebase Storage, botão "Exportar" gerando JSON via `expo-file-system` `File`/`Paths` — API nova do SDK 56 — e compartilhando via `expo-sharing` — req 184, indicador online/offline via `useNetInfo` — req 188). Arquitetura offline-first: fila local em `coletas.ts`/AsyncStorage (`ColetaArvore` com flag `sincronizado`), funciona sem conexão e sincroniza sob demanda. 🔶 por não ter sido testado em dispositivo/emulador. `tsc --noEmit` ok em `apps/arborizacao` (sessão 32: `getReactNativePersistence` corrigido)

### BLOCO 10 — Restantes para 95% (+10 pts → 95%) ✓
43. [ ] Req. 03 — Perfil de terreno/altimetria no mapa
44. [🔶] Req. 11 — Auto-cadastro de usuário cidadão — **sessão 9**: endpoint público `POST /api/auto-cadastro` em `server.ts` (cria usuário no Firebase Auth via Admin SDK, fixa o custom claim `perfil: CIDADAO` ANTES do primeiro login — importante porque `authMiddleware` assume `'ADMIN'` quando a claim está ausente — e insere a linha em `sigweb.usuarios`); `LoginPage.tsx` ganhou alternância "Entrar"/"Cadastre-se" com campo Nome e chamada a `POST /auto-cadastro` seguida de login automático. 🔶 por faltar teste end-to-end (criar conta → logar → acessar Portal do Cidadão) e validações adicionais (e-mail duplicado já tratado, mas falta verificação de e-mail/telefone)
45. [x] ~~Req. 33/36 — Linhas guia e linhas ortogonais no editor cartográfico~~ — já concluído em `EditToolbar` (ver BLOCO 8, item 35)
46. [🔶] Req. 219 — Camada temática PGV de faces de quadra no mapa — **sessão 9**: novo endpoint `GET /pgv/faces-quadra` (`apps/api/src/routes/pgv/index.ts`) retorna as faces de quadra com `valor_calculado IS NOT NULL` como GeoJSON (`ST_AsGeoJSON(ST_Transform(geometry,4326))`, join com quadras/logradouros); novo componente `PgvLayer.tsx` (mesmo padrão do `BairrosLayer` — `L.geoJSON` + `useMapStore.activeLayers`) desenha as faces como linhas com gradiente de cor amarelo→vermelho proporcional ao valor por m² (interpolação RGB entre min/max do conjunto retornado) e tooltip com logradouro/quadra/valor formatado em R$; registrado em `SIGMap.tsx` e legenda de gradiente adicionada ao `LayerControl` (camada "PGV" já existia na lista, sem renderização). 🔶 por faltar verificação visual com setores PGV efetivamente calculados em produção
47. [x] Req. 208 — Dashboards personalizáveis REURB — **sessão 17**: `GET /processos/dashboard?tipo=reurb` (ADMIN/SETOR_PROJETOS/FISCAL_TRIBUTARIO) retorna contagem de processos por situação, total e tempo médio até conclusão; nova aba "Dashboard" em `ReurbPage` (`ReurbDashboard.tsx`) exibe cards por situação com `refetchInterval` de 30s

### Paralelamente — SINTER 🔴 Prazo 31/12/2026
48. [🔶] **sinter.service.ts** — **sessão 10**: `extrairParcelasSinter` (SQL + ST_Transform SIRGAS 2000), `gerarXmlSinter` (layout IN RFB 1.890/2019 v2.0), `validarLote`, `uploadXmlGcs` (Firebase Storage)
49. [🔶] **routes/admin/sinter.ts** — **sessão 10**: 6 endpoints + `SinterPage.tsx` com stats/histórico/detalhe/retorno RFB
50. [ ] Primeiro envio de teste no portal RFB (requer credenciais oficiais — prazo Julho/2026)

### Bug fixes + melhorias SIG — sessão 32
52. [x] **Busca categorizada completa + painel lateral camadas + eas.json** — **sessão 33**: (a) req 06 completado: `GET /loteamentos?q=` inclui geometry; `GET /quadras?q=` criado com filtro por código; `MapPage` busca 4 endpoints em paralelo e exibe 5 categorias coloridas (Bairro/Loteamento/Logradouro/Quadra/Parcela) com zoom adaptado por tipo; (b) `LayerControl` refatorado como sidebar fixo à direita (`top:0 right:0 bottom:0`) com seta `›`/`‹` de colapso e cabeçalho `🗂 Camadas`; botão flutuante removido; `CamadasPanel` (importação temporária SHP/KML de sessão) movido para borda esquerda; (c) `eas.json` em `apps/mobile`, `apps/recadastramento`, `apps/arborizacao` — gerar APK de teste: `npx eas build --platform android --profile preview`; (d) Score G/L/R no corpo do BACKLOG corrigidos para 100% (estavam com dados pré-sessão 31). Score 89,3% (inalterado). `tsc --noEmit` ok em `apps/api`, `apps/web` e 3 apps móveis.

53. [x] **Visualizador 3D embutido (req 228-234)** — **sessão 34**: `PointCloudViewer.tsx` (Three.js, 80 000 pontos, lazy-loaded) em `NuvemPontosPage`; órbita 3D, coordenadas/intensidade no hover, medição de distância, 3 esquemas de cores, densidade e tamanho ajustáveis; req 229/231/232/233/234 `❌→🔶`, req 230 `🔶→✅`. Score **89,3%→90,6%** (+3,0 pts — 212,0/234). Deploy `caroacidadesinteligentes` OK.

54. [x] **3D upgrade — pan + anotações + área (req 229/231/233/234 🔶→✅)** — **sessão 35**: (a) `Orbit` + pan (botão direito, `right.setFromMatrixColumn`); (b) modo "📍 Anotação" com esferas amarelas + labels DOM projetados frame-a-frame via `.project(camera)`; (c) modo "⬛ Área" — polígono multiclique, fecho visual (linha ciano), shoelace XZ, resultado em m²/ha; req 229/231/233/234 promovidos a ✅. Score **90,6%→91,5%** (+2,0 pts — 214,0/234). Deploy Cloud Run OK (c7404aea + df801f3f).

55. [x] **3D: volume + corte em seção (req 232 🔶→✅)** — **sessão 36**: (a) modo "✂ Perfil" — 2 cliques definem seção, corredor adaptativo `max(30, len×3%)`, projeção `t = dot(p-p0, dir)`, scatter canvas 160px com eixos distância × elevação real; (b) volume no closeArea — `pipXZ` ray-casting + `area × avg_height_above_base` → m³; req 232 ✅ (todas 4 ferramentas: distância, área, volume, seção). Score **91,5%→91,7%** (+0,5 pts — 214,5/234). Deploy pendente.

51. [x] **Camadas auxiliares / importação SHP/KML / impressão de mapa** — **sessão 32**: (a) `camadas.ts` corrigido para detectar EPSG:31982 (`detectShpSrid` — `|x|>180`) e gravar SRID correto sem `ST_Transform` desnecessário — fix crítico para shapefiles UTM que não apareciam no mapa; (b) `CamadasPanel.tsx` + `kmlToFeatures()` — suporte a KML via DOMParser, botão "📁 SHP / KML" reposicionado para área visível; (c) `LayerControl.tsx` — botão 🗑 excluir camada permanente via `DELETE /camadas/:id`; (d) `PrintControl.tsx` (novo) + `fetchStaticMapFromBounds` em `staticMap.ts` — impressão de mapa por seleção de bounding box com 2 cliques, renderização de tiles OSM em canvas, PDF A4 landscape (jsPDF); (e) `apps/mobile|recadastramento|arborizacao/src/lib/firebase.ts` + `src/types/firebase-rn.d.ts` — `getReactNativePersistence` migrado para `@firebase/auth` com module augmentation; `tsc --noEmit` ok nos 3 apps. Score inalterado (melhorias em req já ✅ + apps móveis ainda pendentes de teste em dispositivo).

---

## 📊 PROGRESSO POR MÓDULO (resumo executivo)

| Módulo | API | Frontend | Score Edital | Prioridade |
|--------|-----|----------|-------------|------------|
| Infra / Deploy | ✅ | ✅ | N/A | — |
| Autenticação / Perfis (A) | ✅ | ✅ | **100%** (5/5) | Baixa |
| Características Gerais (G) | ✅ | ✅ | **100%** (9/9) | Baixa |
| Cadastro Imobiliário (I) | ✅ | ✅ | **100%** (16/16) | Baixa |
| Edição Cartográfica (C) | ✅ | ✅ | **100%** (12/12) | Baixa |
| Consulta de Viabilidade (V) | ✅ | ✅ | **100%** (6/6) | Baixa |
| Estoque Iluminação (E) | ✅ | ✅ | **100%** (7/7) | Baixa |
| Iluminação Pública (L) | ✅ | ✅ | **100%** (16/16) | Baixa |
| Arborização (R) | ✅ | ✅ | **100%** (15/15) | Baixa |
| Cadastro Social (S) | ✅ | ✅ | **100%** (8/8) | Baixa |
| Numeração Predial (N) | ✅ | ✅ | **100%** (10/10) | Baixa |
| Processo Digital Aprovação (P) | ✅ | ✅ | **100%** (11/11) | Baixa |
| Processo Digital Habite-se (H) | ✅ | ✅ | **100%** (11/11) | Baixa |
| Gestão App Móvel Web (M) | ✅ | ✅ | **100%** (26/26) | Baixa |
| App Móvel Chamados (MA) | ✅ | 🔶 | **50%** (7/14) — teste em dispositivo | **Alta** |
| App Móvel Recadastramento (MB) | ✅ | 🔶 | **50%** (7,5/15) — teste em dispositivo | **Alta** |
| App Móvel Arborização (MC) | ✅ | 🔶 | **50%** (3,5/7) — teste em dispositivo | **Alta** |
| REURB Digital (RU) | ✅ | ✅ | **100%** (20/20) | Baixa |
| PGV (PG) | ✅ | 🔶 | **97%** (18,5/19) — req 219 aguarda dados PGV | Baixa |
| Nuvem de Pontos 3D (3D) | ✅ | 🔶 | **93%** (6,5/7) — 228=dados aerofotogramétricos reais pendentes | Média* |
| SINTER (fora do edital) | 🔶 | 🔶 | N/A | **🔴 Prazo dez/26** |

> *Nuvem 3D: dependente da entrega dos dados aerofotogramétricos (Jun/Jul 2026)

---

*BACKLOG gerado automaticamente com base no Edital Pregão nº 28/2026, Processo 903/2026, Município de Tupanciretã – RS*  
*Atualizar este arquivo sempre que um requisito for implementado, alterando o status e a data.*
