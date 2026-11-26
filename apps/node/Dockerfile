# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sd/node build
RUN pnpm --filter @sd/node deploy --legacy --prod /prod/node

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /prod/node/ ./
EXPOSE 3000
CMD ["node", "dist/main.js"]