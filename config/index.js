import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';

dotenv.config();

// Server configuration
export const serverConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development'
};

// Storage configuration
export const storageConfig = {
  uploadMode: process.env.UPLOAD_MODE || 's3', // 's3' or 'local'
  localStoragePath: process.env.LOCAL_STORAGE_PATH || './uploads'
};

// AWS S3 configuration
export const s3Config = {
  region: process.env.AWS_REGION || 'ap-southeast-1',
  bucket: process.env.S3_BUCKET || 'khai-photo',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

// API configuration
export const apiConfig = {
  expectedApiKey: process.env.EXPECTED_API_KEY || 'your-app-api-key'
};

// Initialize S3 client
export const s3Client = new S3Client({
  region: s3Config.region,
  credentials: {
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
  },
});

// Validation function to check if required environment variables are set
export function validateConfig() {
  const uploadMode = process.env.UPLOAD_MODE || 's3';

  // Validate upload mode
  if (!['s3', 'local'].includes(uploadMode)) {
    console.error(`Invalid UPLOAD_MODE: ${uploadMode}. Must be 's3' or 'local'`);
    process.exit(1);
  }

  // Required variables based on upload mode
  let requiredVars = [];

  if (uploadMode === 's3') {
    requiredVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY'
    ];
  }

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error(`Missing required environment variables for ${uploadMode} mode: ${missingVars.join(', ')}`);
    process.exit(1);
  }

  // Warn about optional but recommended variables
  if (uploadMode === 's3') {
    if (!process.env.AWS_REGION) {
      console.warn('Warning: AWS_REGION not set, using default: ap-southeast-1');
    }

    if (!process.env.S3_BUCKET) {
      console.warn('Warning: S3_BUCKET not set, using default: khai-photo');
    }
  }

  if (!process.env.EXPECTED_API_KEY) {
    console.warn('Warning: EXPECTED_API_KEY not set, using default value');
  }

  console.log(`Storage mode: ${uploadMode}`);
}

// Export all configurations for easy access
export const config = {
  server: serverConfig,
  storage: storageConfig,
  s3: s3Config,
  api: apiConfig
};