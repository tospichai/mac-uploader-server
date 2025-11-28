import { getPrismaClient } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/passwordUtils.js';
import { generateToken } from '../utils/jwtUtils.js';
import { v4 as uuidv4 } from 'uuid';

const prisma = getPrismaClient();

/**
 * Create a new photographer
 * @param {Object} photographerData - Photographer registration data
 * @returns {Object} Created photographer without password
 */
export async function createPhotographer(photographerData) {
  try {
    const {
      username,
      email,
      password,
      displayName,
      logoUrl,
      facebookUrl,
      instagramUrl,
      twitterUrl,
      websiteUrl
    } = photographerData;

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate unique API key
    const apiKey = `pk_${uuidv4().replace(/-/g, '')}`;

    // Create photographer
    const photographer = await prisma.photographer.create({
      data: {
        username,
        email,
        password: hashedPassword,
        displayName,
        logoUrl,
        facebookUrl,
        instagramUrl,
        twitterUrl,
        websiteUrl,
        apiKey
      }
    });

    // Remove password from response
    const { password: _, ...photographerWithoutPassword } = photographer;

    return photographerWithoutPassword;
  } catch (error) {
    if (error.code === 'P2002') {
      // Unique constraint violation
      const target = error.meta?.target;
      if (target?.includes('username')) {
        throw new Error('Username already exists');
      } else if (target?.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    throw new Error('Failed to create photographer: ' + error.message);
  }
}

/**
 * Authenticate photographer and generate JWT token
 * @param {string} usernameOrEmail - Username or email
 * @param {string} password - Plain password
 * @returns {Object} Photographer data and JWT token
 */
export async function authenticatePhotographer(usernameOrEmail, password) {
  try {
    // Find photographer by username or email
    const photographer = await prisma.photographer.findFirst({
      where: {
        OR: [
          { username: usernameOrEmail },
          { email: usernameOrEmail }
        ]
      }
    });

    if (!photographer) {
      throw new Error('Photographer not found');
    }

    if (!photographer.isActive) {
      throw new Error('Photographer account is inactive');
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, photographer.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Generate JWT token
    const token = generateToken({
      photographerId: photographer.id,
      username: photographer.username,
      email: photographer.email
    });

    // Remove password from response
    const { password: _, ...photographerWithoutPassword } = photographer;

    return {
      photographer: photographerWithoutPassword,
      token
    };
  } catch (error) {
    if (error.message === 'Photographer not found' ||
        error.message === 'Invalid password' ||
        error.message === 'Photographer account is inactive') {
      throw error;
    }
    throw new Error('Authentication failed: ' + error.message);
  }
}

/**
 * Get photographer by ID
 * @param {string} id - Photographer ID
 * @returns {Object} Photographer data without password
 */
export async function getPhotographerById(id) {
  try {
    const photographer = await prisma.photographer.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        logoUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        apiKey: true,
        storageQuotaMb: true,
        storageUsedMb: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!photographer) {
      throw new Error('Photographer not found');
    }

    return photographer;
  } catch (error) {
    if (error.message === 'Photographer not found') {
      throw error;
    }
    throw new Error('Failed to get photographer: ' + error.message);
  }
}

/**
 * Update photographer profile
 * @param {string} id - Photographer ID
 * @param {Object} updateData - Data to update
 * @returns {Object} Updated photographer data
 */
export async function updatePhotographer(id, updateData) {
  try {
    // Remove sensitive fields that shouldn't be updated directly
    const { password, apiKey, id: _, createdAt, ...safeUpdateData } = updateData;

    const photographer = await prisma.photographer.update({
      where: { id },
      data: safeUpdateData,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        logoUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        websiteUrl: true,
        apiKey: true,
        storageQuotaMb: true,
        storageUsedMb: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return photographer;
  } catch (error) {
    if (error.code === 'P2002') {
      // Unique constraint violation
      const target = error.meta?.target;
      if (target?.includes('username')) {
        throw new Error('Username already exists');
      } else if (target?.includes('email')) {
        throw new Error('Email already exists');
      }
    }
    if (error.code === 'P2025') {
      throw new Error('Photographer not found');
    }
    throw new Error('Failed to update photographer: ' + error.message);
  }
}

/**
 * Update photographer password
 * @param {string} id - Photographer ID
 * @param {string} newPassword - New password
 * @returns {boolean} Success status
 */
export async function updatePhotographerPassword(id, newPassword) {
  try {
    const hashedPassword = await hashPassword(newPassword);

    await prisma.photographer.update({
      where: { id },
      data: { password: hashedPassword }
    });

    return true;
  } catch (error) {
    throw new Error('Failed to update password: ' + error.message);
  }
}

/**
 * Update photographer storage usage
 * @param {string} id - Photographer ID
 * @param {number} storageUsedMb - Storage used in MB
 * @returns {boolean} Success status
 */
export async function updateStorageUsage(id, storageUsedMb) {
  try {
    await prisma.photographer.update({
      where: { id },
      data: { storageUsedMb }
    });

    return true;
  } catch (error) {
    throw new Error('Failed to update storage usage: ' + error.message);
  }
}

/**
 * Check if photographer exists by username or email
 * @param {string} username - Username to check
 * @param {string} email - Email to check
 * @returns {Object} Existence status
 */
export async function checkPhotographerExists(username, email) {
  try {
    const existingPhotographer = await prisma.photographer.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    return {
      usernameExists: existingPhotographer?.username === username,
      emailExists: existingPhotographer?.email === email
    };
  } catch (error) {
    throw new Error('Failed to check photographer existence: ' + error.message);
  }
}

/**
 * Close Prisma connection
 */
export async function disconnect() {
  await prisma.$disconnect();
}