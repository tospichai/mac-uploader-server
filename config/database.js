import { PrismaClient } from '@prisma/client';

// Create Prisma client instance
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:./dev.db"
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
});

/**
 * Test database connection
 * @returns {Promise<boolean>} Connection status
 */
export async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

/**
 * Get Prisma client instance
 * @returns {PrismaClient} Prisma client
 */
export function getPrismaClient() {
  return prisma;
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting from database:', error.message);
  }
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

export default prisma;