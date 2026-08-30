# ---------------------------------------------------------------------------
# Build stage - installs every dependency, generates the Prisma client and
# compiles TypeScript to plain JavaScript.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package*.json ./
RUN npm ci

# The Prisma client is generated from the schema, so it has to be present
# before the build step.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage - production dependencies and compiled output only.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# Run as an unprivileged user rather than root.
USER node

EXPOSE 4000

# `migrate deploy` applies any pending migrations before the API accepts
# traffic, so a deploy never serves requests against an outdated schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
