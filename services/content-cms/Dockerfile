FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
# Payload loads its config during `next build`. These values are deliberately
# non-secret build placeholders; the runtime image does not inherit this stage,
# and Compose injects the real values only when a container starts.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV PAYLOAD_SECRET=build_only_placeholder_not_for_runtime_0123456789abcdef
ENV PAYLOAD_PUBLIC_SERVER_URL=https://admin.invalid
ENV PUBLIC_MEDIA_ORIGIN=https://content.invalid
ENV SITE_ORIGIN=https://site.invalid
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --gid 10001 payload && useradd --uid 10001 --gid payload --create-home payload
COPY --from=build --chown=payload:payload /app/.next/standalone ./
COPY --from=build --chown=payload:payload /app/.next/static ./.next/static
COPY --from=build --chown=payload:payload /app/public ./public
USER payload
EXPOSE 3000
CMD ["node", "server.js"]
