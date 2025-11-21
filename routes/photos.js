import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { validateApiKey } from '../middleware/auth.js';
import { corsForSSE } from '../middleware/cors.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  processImage
} from '../services/imageService.js';
import {
  uploadPhotoToS3,
  getEventPhotos,
  generatePhotoUrls,
  getS3Object
} from '../services/s3Service.js';
import {
  addSSEConnection,
  setupSSEResponse,
  broadcastPhotoUpdate
} from '../services/sseService.js';
import {
  createSuccessResponse,
  createErrorResponse,
  createPhotoUploadResponse,
  createPhotoDataForSSE
} from '../utils/responseUtils.js';
import {
  ERROR_MESSAGES,
  PHOTOS_PER_PAGE
} from '../config/constants.js';
import { logInfo, logError } from '../middleware/logger.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload photo endpoint
 * POST /api/events/:event_code/photos
 */
router.post(
  '/api/events/:event_code/photos',
  upload.fields([
    { name: 'original_file', maxCount: 1 },
    { name: 'thumb_file', maxCount: 1 },
  ]),
  validateApiKey,
  asyncHandler(async (req, res) => {
    const eventCode = req.params.event_code || 'unknown';
    logInfo(`Photo upload request for event: ${eventCode}`, 'PhotosRoute');

    // Extract files from request
    const originalFile = req.files?.original_file?.[0] || null;
    const thumbFile = req.files?.thumb_file?.[0] || null;

    if (!originalFile) {
      return res.status(400).json(
        createErrorResponse(ERROR_MESSAGES.MISSING_ORIGINAL_FILE, 400)
      );
    }

    // Extract metadata
    const originalName = req.body.original_name || originalFile.originalname || 'photo';
    const localPath = req.body.local_path || '';
    const shotAt = req.body.shot_at || '';
    const checksum = req.body.checksum || null;

    // Generate photo ID
    const photoId = uuidv4();

    try {
      // Process original file
      logInfo(`Processing original file: ${originalName}`, 'PhotosRoute');
      const processedOriginal = await processImage(originalFile, originalName);

      // Process thumbnail if provided
      let processedThumb = null;
      if (thumbFile) {
        logInfo(`Processing thumbnail file: ${thumbFile.originalname}`, 'PhotosRoute');
        try {
          processedThumb = await processImage(thumbFile, thumbFile.originalname);
        } catch (error) {
          logError(error, 'PhotosRoute.thumbnailProcessing');
          // Continue without thumbnail if processing fails
        }
      }

      // Upload to S3
      const uploadResult = await uploadPhotoToS3(
        processedOriginal,
        processedThumb,
        eventCode,
        photoId
      );

      // Create photo data for response
      const photoUploadData = {
        photoId,
        originalKey: uploadResult.originalKey,
        thumbKey: uploadResult.thumbKey,
        bucket: uploadResult.bucket,
        region: uploadResult.region,
        originalName,
        localPath,
        shotAt,
        checksum,
        eventCode,
        processed: processedOriginal.processed,
        originalFormat: processedOriginal.originalFormat || null
      };

      // Create photo data for SSE broadcast
      const photoDataForSSE = createPhotoDataForSSE({
        photoId,
        displayUrl: uploadResult.displayUrl,
        downloadUrl: uploadResult.downloadUrl,
        originalName,
        localPath,
        shotAt,
        checksum
      });

      // Broadcast photo update to all connected clients
      broadcastPhotoUpdate(eventCode, photoDataForSSE);

      // Return success response
      res.json(createPhotoUploadResponse(photoUploadData));

    } catch (error) {
      logError(error, 'PhotosRoute.photoUpload');

      if (error.message.includes('processing failed')) {
        return res.status(400).json(
          createErrorResponse(`${ERROR_MESSAGES.FILE_PROCESSING_FAILED}: ${error.message}`, 400)
        );
      }

      return res.status(500).json(
        createErrorResponse('Server error during photo upload', 500)
      );
    }
  })
);

/**
 * Get photo gallery endpoint
 * GET /:event_code/photos
 */
router.get('/:event_code/photos', asyncHandler(async (req, res) => {
  const eventCode = req.params.event_code;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * PHOTOS_PER_PAGE;

  logInfo(`Fetching photos for event: ${eventCode}, page: ${page}`, 'PhotosRoute');

  try {
    // Get photos from S3
    const photos = await getEventPhotos(eventCode);

    // Generate URLs for photos
    const photosWithUrls = await generatePhotoUrls(photos);

    // Apply pagination
    const totalPhotos = photosWithUrls.length;
    const totalPages = Math.ceil(totalPhotos / PHOTOS_PER_PAGE);
    const paginatedPhotos = photosWithUrls.slice(offset, offset + PHOTOS_PER_PAGE);

    // Create pagination data
    const pagination = {
      currentPage: page,
      totalPages,
      hasMultiplePages: totalPages > 1,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page > 1 ? page - 1 : null,
      nextPage: page < totalPages ? page + 1 : null,
      pages: Array.from({ length: totalPages }, (_, i) => ({
        number: i + 1,
        active: i + 1 === page
      }))
    };

    // Generate HTML template
    const html = generateGalleryHTML(eventCode, paginatedPhotos, totalPhotos, pagination);

    res.send(html);

  } catch (error) {
    logError(error, 'PhotosRoute.getGallery');

    const errorHTML = generateErrorHTML(
      'Error',
      'Failed to load photos: ' + error.message,
      {
        isError: true,
        showRetry: true,
        showBack: true,
        autoRetry: true,
        maxRetries: 3,
        retryDelay: 5000
      }
    );

    res.status(500).send(errorHTML);
  }
}));

/**
 * SSE endpoint for real-time photo updates
 * GET /:event_code/photos/stream
 */
router.get('/:event_code/photos/stream', corsForSSE, (req, res) => {
  const eventCode = req.params.event_code;

  logInfo(`New SSE connection for event: ${eventCode}`, 'PhotosRoute');

  // Set up SSE response
  setupSSEResponse(res);

  // Add connection to SSE service
  addSSEConnection(eventCode, res);
});

/**
 * Get single photo endpoint
 * GET /:event_code/photos/:photoId
 */
router.get('/:event_code/photos/:photoId', asyncHandler(async (req, res) => {
  const { event_code: eventCode, photoId } = req.params;

  if (!eventCode) {
    return res.status(400).json(
      createErrorResponse('eventCode parameter is required', 400)
    );
  }

  logInfo(`Downloading photo: ${photoId} from event: ${eventCode}`, 'PhotosRoute');

  try {
    const key = `events/${eventCode}/${photoId}_original.jpg`;
    const data = await getS3Object(key);

    // Read stream as buffer
    const chunks = [];
    for await (const chunk of data.Body) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');

    res.json(
      createSuccessResponse({
        photoId,
        base64: `data:image/jpeg;base64,${base64}`
      })
    );

  } catch (error) {
    logError(error, 'PhotosRoute.getPhoto');

    res.status(500).json(
      createErrorResponse(ERROR_MESSAGES.DOWNLOAD_FAILED, 500)
    );
  }
}));

/**
 * Generate gallery HTML template
 */
function generateGalleryHTML(eventCode, photos, totalPhotos, pagination) {
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Photo Gallery - ${eventCode}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 1rem;
        }
        @media (max-width: 640px) {
          .photo-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 0.5rem;
          }
        }
        .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0,0,0,0.9);
        }
        .modal.active {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-content {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
        }
        @media (min-width: 768px) {
          .modal-content {
            max-width: 80%;
          }
        }
      </style>
    </head>
    <body class="bg-gray-100 min-h-screen">
      <div class="container mx-auto px-4 py-8">
        <header class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-800 mb-2">Photo Gallery</h1>
          <p class="text-gray-600">Event: <span class="font-semibold">${eventCode}</span></p>
          <p class="text-gray-500 text-sm mt-1">Total: ${totalPhotos} photos</p>
        </header>

        <main>
          <div class="photo-grid mb-8">
            ${photos.map(photo => `
              <div class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div class="aspect-square relative group cursor-pointer m-2 border rounded-lg overflow-hidden" onclick="openModal('${photo.displayUrl || photo.downloadUrl}')">
                  ${photo.displayUrl || photo.downloadUrl ? `
                    <img src="${photo.displayUrl || photo.downloadUrl}" alt="Photo ${photo.photoId}"
                        class="w-full h-full object-cover"
                        loading="lazy">

                    <!-- Eye icon in center on hover -->
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none">
                      <svg class="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                      </svg>
                    </div>
                  ` : `
                    <div class="w-full h-full bg-gray-200 flex items-center justify-center">
                      <span class="text-gray-500">No image</span>
                    </div>
                  `}
                </div>
                <div class="p-3 flex justify-between items-center">
                  <div class="min-w-0 flex-1 mr-2">
                    <p class="text-xs text-gray-500 truncate" title="ID: ${photo.photoId}">ID: ${photo.photoId}</p>
                    <p class="text-xs text-gray-400 truncate" title="${photo.lastModified ? new Date(photo.lastModified).toLocaleString('th-TH') : ''}">
                      ${photo.lastModified ? new Date(photo.lastModified).toLocaleString('th-TH') : ''}
                    </p>
                  </div>
                  ${photo.downloadUrl ? `
                    <button onclick="downloadPhoto('/${eventCode}/photos/${photo.photoId}', '${photo.photoId}')"
                      class="flex-shrink-0 text-black px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors duration-200 flex items-center">
                      <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                      </svg>
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Pagination -->
          ${pagination.hasMultiplePages ? `
            <div class="flex justify-center items-center space-x-2">
              ${pagination.hasPrevPage ? `
                <a href="?page=${pagination.prevPage}"
                   class="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700">
                  Previous
                </a>
              ` : ''}

              <div class="flex space-x-1">
                ${pagination.pages.map(p => `
                  <a href="?page=${p.number}"
                     class="px-3 py-2 ${p.active ? "bg-blue-500 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"} rounded-md text-sm font-medium">
                    ${p.number}
                  </a>
                `).join('')}
              </div>

              ${pagination.hasNextPage ? `
                <a href="?page=${pagination.nextPage}"
                   class="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700">
                  Next
                </a>
              ` : ''}
            </div>
          ` : ''}
        </main>

        <!-- Image Modal -->
        <div id="imageModal" class="modal">
          <button onclick="closeModal()" class="absolute top-4 right-4 bg-white text-gray-800 p-2 rounded-full hover:bg-gray-200 transition-colors duration-200 z-10">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
          <img id="modalImage" class="modal-content" src="" alt="Full size image">
        </div>

        <footer class="text-center mt-12 text-gray-500 text-sm">
          <p>Photo Gallery Server</p>
        </footer>
      </div>

      <script src="/js/gallery.js"></script>
    </body>
    </html>
  `;
}

/**
 * Generate error HTML template
 */
function generateErrorHTML(title, message, options = {}) {
  const {
    isError = true,
    isWarning = false,
    isInfo = false,
    showRetry = false,
    showBack = false,
    showHome = false,
    autoRetry = false,
    maxRetries = 3,
    retryDelay = 3000,
    statusCode = null,
    details = null
  } = options;

  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Photo Gallery</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
      <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full mx-4">
        <div class="text-center">
          ${isError ? `
            <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <svg class="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
          ` : ''}

          ${isWarning ? `
            <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
              <svg class="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
            </div>
          ` : ''}

          ${isInfo ? `
            <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
              <svg class="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
          ` : ''}

          <h1 class="text-2xl font-bold ${isError ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-blue-600'} mb-4">
            ${title}
          </h1>

          <p class="text-gray-700 mb-6">${message}</p>

          ${details ? `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left">
              <h3 class="text-sm font-semibold text-gray-600 mb-2">รายละเอียด:</h3>
              <pre class="text-xs text-gray-600 whitespace-pre-wrap">${details}</pre>
            </div>
          ` : ''}

          <div class="space-y-3">
            ${showRetry ? `
              <button onclick="window.location.reload()" class="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200" data-auto-retry="true" data-max-retries="${maxRetries}" data-retry-delay="${retryDelay}">
                ลองใหม่
              </button>
            ` : ''}

            ${showBack ? `
              <a href="javascript:history.back()" class="block w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors duration-200 text-center">
                กลับไปหน้าก่อนหน้า
              </a>
            ` : ''}

            ${showHome ? `
              <a href="/" class="block w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors duration-200 text-center">
                หน้าแรก
              </a>
            ` : ''}
          </div>

          ${statusCode ? `
            <p class="text-xs text-gray-500 mt-6">
              Error Code: ${statusCode}
            </p>
          ` : ''}
        </div>
      </div>

      <script>
        // Auto-retry functionality for specific errors
        window.addEventListener('load', () => {
          const retryButton = document.querySelector('[data-auto-retry="true"]');
          if (retryButton) {
            let retryCount = 0;
            const maxRetries = parseInt(retryButton.dataset.maxRetries) || 3;
            const retryDelay = parseInt(retryButton.dataset.retryDelay) || 3000;

            function autoRetry() {
              if (retryCount < maxRetries) {
                retryCount++;
                console.log('Auto-retry attempt ' + retryCount + '/' + maxRetries);

                // Show countdown
                const originalText = retryButton.textContent;
                let countdown = retryDelay / 1000;

                const countdownInterval = setInterval(() => {
                  retryButton.textContent = 'ลองใหม่ (' + countdown + 's)';
                  countdown--;

                  if (countdown < 0) {
                    clearInterval(countdownInterval);
                    retryButton.textContent = originalText;
                    window.location.reload();
                  }
                }, 1000);
              }
            }

            // Start auto-retry after page load
            setTimeout(autoRetry, 1000);
          }
        });

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
          if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
            window.location.reload();
          } else if (e.key === 'Escape') {
            history.back();
          }
        });
      </script>
    </body>
    </html>
  `;
}

export default router;