# ใช้ Node.js 22 (Debian base) มี apt-get ให้ใช้
FROM node:22-bookworm AS base

# ให้เห็นชัด ๆ ว่า node กับ npm มีจริง
RUN node -v && corepack disable || true

# ติดตั้ง npm + dcraw แบบชัวร์ๆ
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       npm \
       dcraw \
  && rm -rf /var/lib/apt/lists/*

# ตั้ง working directory
WORKDIR /app

# copy package.json / package-lock.json มาก่อน
COPY package*.json ./

# ติดตั้ง dependencies (production only)
RUN npm install --omit=dev && npm cache clean --force

# สร้าง user ปลอดภัย
RUN useradd -u 1001 -m nodejs

# copy source code ทั้งหมด
COPY --chown=nodejs:nodejs . .

# สลับไปใช้ non-root user
USER nodejs

# ให้ app ฟัง port 7001 ข้างใน container
EXPOSE 7001

# healthcheck port 7001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# สั่งรัน app
CMD ["npm", "start"]
