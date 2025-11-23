FROM node:22-bookworm AS base

WORKDIR /app

# ติดตั้ง exiftool (ดึง embedded preview จาก NEF)
RUN apt-get update && \
    apt-get install -y --no-install-recommends exiftool && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs

COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 7001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]
