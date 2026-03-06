FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/
COPY agents/ ./agents/
COPY container/ ./container/
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
