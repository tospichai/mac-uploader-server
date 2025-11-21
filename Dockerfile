# ใช้ Node.js 22 (Debian base) เพื่อให้มี npm + apt-get ได้แน่นอน
FROM node:22 AS base

# Set working directory
WORKDIR /app

# ติดตั้ง dcraw สำหรับแปลง NEF → TIFF
RUN apt-get update \
  && apt-get install -y --no-install-recommends dcraw \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first for better Docker layer caching
COPY package*.json ./

# ติดตั้ง dependencies สำหรับ production
# ถ้า package-lock.json มีอยู่ npm จะใช้ lockfile ให้
RUN npm install --omit=dev && npm cache clean --force

# สร้าง non-root user
RUN useradd -u 1001 -m nodejs

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port ข้างใน container
EXPOSE 7001

# Health check ให้ชี้ไปที่ 7001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]