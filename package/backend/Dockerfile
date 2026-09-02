## ---- deps: install full dependency tree (incl. dev) for building ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

## ---- build: compile TypeScript to dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

## ---- prod-deps: install production-only dependencies ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

## ---- runtime: minimal image with compiled output only ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user (OWASP: least privilege)
RUN addgroup -S nestjs && adduser -S nestjs -G nestjs

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main.js"]