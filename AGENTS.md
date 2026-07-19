<!-- BEGIN:antigravity-agent-rules -->
# Diretrizes do Projeto SIGWEB Tupanciretã

1. A stack principal do projeto usa **React + Vite** no frontend (`apps/web`) e **Fastify + Node.js** no backend (`apps/api`). Os aplicativos móveis usam **React Native com Expo** (`apps/mobile`, `apps/recadastramento`, `apps/arborizacao`).
2. **Nova Arquitetura:** O projeto migrou **totalmente** do Firebase e Google Cloud para **Supabase (self-hosted)** (Auth, Storage, Postgres/PostGIS) e **Dokploy** (para deploy e infraestrutura em servidor próprio).
3. **NÃO utilize** serviços como Firebase Auth, Firebase Storage, Firebase Hosting, Firebase Messaging (FCM) via Cloud Functions (apenas via admin SDK adaptado, se necessário), GCP Cloud Run ou GCP Cloud Storage. Tudo deve apontar para as soluções equivalentes no Supabase e no servidor próprio.
4. O gerenciador de pacotes do monorepo é o `npm` com workspaces configurados em `package.json`.
<!-- END:antigravity-agent-rules -->
