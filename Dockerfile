# ---- build stage ----
FROM node:24-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund
COPY server server
COPY web web
RUN npx -w server prisma generate \
  && npm run build -w web \
  && npm run build -w server

# ---- runtime stage ----
FROM node:24-alpine
# openssl: Prisma engine; postgresql17-client: pg_dump for the nightly backup
# (must match the postgres:17 server version)
RUN apk add --no-cache openssl postgresql17-client
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --no-audit --no-fund
# generated Prisma client engine from the build stage
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/web/dist web/dist
EXPOSE 3001
# runs pending migrations, then starts the API (which also serves the web app)
CMD ["npm", "run", "start:prod", "-w", "server"]
