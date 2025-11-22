# ใช้ Debian แทน Alpine เพื่อให้ติดตั้ง darktable-cli / LibRaw ง่าย
FROM node:22-bookworm AS base

WORKDIR /app

# ติดตั้งเครื่องมือแปลง RAW (ตัวอย่างใช้ darktable-cli)
RUN apt-get update && \
    apt-get install -y --no-install-recommends darktable && \
    rm -rf /var/lib/apt/lists/*

# Copy package + install deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ตั้ง user ให้ปลอดภัย
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs

# Copy app code
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 7001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:7001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]
