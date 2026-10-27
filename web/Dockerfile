# Build stage: compilers are needed only here (better-sqlite3 is a native module).
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build \
 && rm -rf .next/cache \
 && npm prune --omit=dev

# Runtime stage: production dependencies and the build output only, no compilers, runs as an unprivileged user.
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat tzdata
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Vilnius
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./
COPY --from=build --chown=node:node /app/scripts ./scripts
# The database folder is a volume (see docker-compose.yml); it must be writable for the "node" user (uid 1000).
RUN mkdir -p prisma && chown node:node prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/login || exit 1
# bootstrap.cjs prepares a new database (schema, chart of accounts, administrator) and never changes an existing one.
CMD ["sh", "-c", "node scripts/bootstrap.cjs && exec node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
