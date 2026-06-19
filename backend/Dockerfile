FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig*.json ./
COPY package*.json ./
EXPOSE 3001
# Применяет миграции и запускает сервер
CMD sh -c "npx prisma migrate deploy && node dist/main"
