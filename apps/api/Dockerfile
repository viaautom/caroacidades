FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --workspace=packages/shared --workspace=apps/api
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY shapefiles/bairros_tupariceta.geojson ./bairros_tupariceta.geojson
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/bairros_tupariceta.geojson ./
EXPOSE 3001
CMD ["node", "dist/server.js"]
