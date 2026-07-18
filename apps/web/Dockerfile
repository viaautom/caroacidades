FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --workspace=packages/shared --workspace=apps/web
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build --workspace=packages/shared

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_STORAGE_BUCKET
ARG VITE_PG_TILESERV_URL
ARG VITE_POTREE_URL
ARG VITE_ORTOMOSAICO_WMTS_URL
ARG VITE_MAPILLARY_TOKEN
ARG VITE_DEV_PASSWORD
RUN npm run build --workspace=apps/web

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
