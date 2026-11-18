# Legacy PostgreSQL API container. The hosted Firebase API uses build:render.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps ./apps
COPY packages ./packages
COPY infra ./infra
COPY tests ./tests
COPY legacy/src/services/keywords.js ./legacy/src/services/keywords.js
COPY tsconfig.json ./
ARG VITE_OIDC_AUTHORITY
ARG VITE_OIDC_CLIENT_ID
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 8080
CMD ["node", "dist/apps/api/main.js"]
