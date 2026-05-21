FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json /app/bun.lock ./
RUN bun install --frozen-lockfile --production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "build/index.js"]
