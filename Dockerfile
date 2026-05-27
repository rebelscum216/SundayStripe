FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api ./apps/api

RUN pnpm --filter @sunday-stripe/db build
RUN pnpm --filter @sunday-stripe/api build

EXPOSE 3001

CMD ["sh", "-c", "pnpm --filter @sunday-stripe/db migrate && node apps/api/dist/main.js"]
