FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

LABEL org.opencontainers.image.title="Education Scope MCP" \
      org.opencontainers.image.description="Japanese school curriculum scope checker backed by normalized MEXT curriculum-code data" \
      org.opencontainers.image.source="https://github.com/YAMA-TANA/EDUCATION_SCOPE_MCP" \
      org.opencontainers.image.licenses="MIT" \
      io.modelcontextprotocol.server.name="io.github.YAMA-TANA/education-scope-mcp"

COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY data/mext/normalized ./data/mext/normalized

ENTRYPOINT ["node", "dist/src/index.js"]
