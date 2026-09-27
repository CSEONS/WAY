FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 compiles from source when there is no ready-made binary for
# this Node version; the tools stay in this stage only.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data /app/uploads && chown -R node:node /app/data /app/uploads
EXPOSE 4000
# Starts as root only to fix volume ownership, then runs as "node" (see the script).
ENTRYPOINT ["docker-entrypoint.sh"]
# node directly, not npm: it receives SIGTERM and closes the database cleanly.
CMD ["node", "dist/server.js"]
