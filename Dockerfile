# Textblast production image
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install deps (postinstall runs `prisma generate`, which needs the schema)
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Build
COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
# Map the Neon connection string (Fly secret) to DATABASE_URL, sync the Postgres
# schema on boot (fresh DB = create only; non-interactive push refuses
# destructive changes rather than dropping data), then serve.
CMD ["sh", "-c", "export DATABASE_URL=\"${NEON_PRODUCTION_DATABASE_URL:-$DATABASE_URL}\"; npx prisma db push --skip-generate && npm run start"]
