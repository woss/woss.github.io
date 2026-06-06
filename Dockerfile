FROM oven/bun:1.2-alpine AS deps
WORKDIR /app
# Python + build-base for native addons (better-sqlite3) that need node-gyp on Alpine musl
RUN apk add --no-cache python3 build-base
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .

# Python + build-base for native addons (better-sqlite3) that need node-gyp on Alpine musl
RUN apk add --no-cache python3 build-base
RUN bun run build

FROM oven/bun:1.2-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
# build-index.ts needs source + node_modules at runtime
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json /app/bun.lock ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "build/index.js"]
