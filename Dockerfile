FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY public ./public
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node
# Applies pending migrations on start, then serves the API and the web client.
CMD ["npx", "tsx", "src/index.ts"]
