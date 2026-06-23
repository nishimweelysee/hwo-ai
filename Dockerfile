FROM node:20-slim AS base

FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_TIMEOUT=120000
RUN for i in 1 2 3; do \
      if npm ci; then break; fi; \
      if [ $i -eq 3 ]; then exit 1; fi; \
      echo "Attempt $i failed, retrying in 45s..."; sleep 45; \
    done

COPY . .
ARG BACKEND_API_URL=http://hwo_backend:8080
ENV BACKEND_API_URL=$BACKEND_API_URL
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN ./node_modules/.bin/next build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/false nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p .next && chown nextjs:nodejs .next
USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]
