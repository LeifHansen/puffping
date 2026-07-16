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
# Create/migrate the SQLite schema on boot, then serve.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]
