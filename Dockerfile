# Use Node.js 22 LTS Alpine Linux for smaller image size and x86_64 compatibility
FROM node:22-slim AS base

# Set working directory
WORKDIR /app

# Install system dependencies (dcraw for NEF → TIFF)
# ติดตั้ง dcraw (หรือจะใช้ libraw-bin ก็ได้)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       dcraw \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 7001

# Health check to verify the application is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]