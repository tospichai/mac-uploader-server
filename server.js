import express from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import cors from "cors";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

// ====== SSE CONFIG ======
// Store active SSE connections per event code
const sseConnections = new Map(); // eventCode -> Set of response objects

// ====== S3 CONFIG ======
const AWS_REGION = process.env.AWS_REGION || "ap-southeast-1";
const S3_BUCKET = process.env.S3_BUCKET || "khai-photo";
const EXPECTED_API_KEY = process.env.EXPECTED_API_KEY || "your-app-api-key";

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ====== IMAGE PROCESSING UTILITIES ======
// Function to check if file extension is allowed for direct upload
function isDirectUploadAllowed(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png'].includes(ext);
}

// Function to check if file is NEF format
function isNEFFile(filename) {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return ext === '.nef';
}

// Function to process image based on file type
async function processImage(file, filename) {
  if (!file || !file.buffer) {
    throw new Error('Invalid file data');
  }

  // If it's already a supported format (jpg, jpeg, png), return as-is
  if (isDirectUploadAllowed(filename)) {
    return {
      buffer: file.buffer,
      mimetype: file.mimetype || 'image/jpeg',
      processed: false
    };
  }

  // If it's NEF file, convert to JPG with optimization
  if (isNEFFile(filename)) {
    try {
      console.log(`Converting NEF file: ${filename}`);

      // Convert NEF to JPG with max width 2048px and optimized quality
      const processedBuffer = await sharp(file.buffer)
        .resize({
          width: 2048,
          height: null, // auto height
          withoutEnlargement: true // don't enlarge if smaller
        })
        .jpeg({
          quality: 85, // good quality with reasonable file size
          progressive: true
        })
        .toBuffer();

      return {
        buffer: processedBuffer,
        mimetype: 'image/jpeg',
        processed: true,
        originalFormat: 'NEF'
      };
    } catch (error) {
      console.error(`Error processing NEF file ${filename}:`, error);
      throw new Error(`Failed to process NEF file: ${error.message}`);
    }
  }

  // If it's another unsupported format, try to convert to JPG
  try {
    console.log(`Attempting to convert unsupported file: ${filename}`);

    const processedBuffer = await sharp(file.buffer)
      .resize({
        width: 2048,
        height: null,
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimetype: 'image/jpeg',
      processed: true,
      originalFormat: path.extname(filename).substring(1)
    };
  } catch (error) {
    console.error(`Error processing file ${filename}:`, error);
    throw new Error(`Unsupported file format: ${path.extname(filename)}`);
  }
}

// ====== EXPRESS + MULTER CONFIG ======
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  if (req.method === "POST") {
    console.log("Body:", req.body);
    console.log("Files:", req.files);
  }
  next();
});

// ====== ENTRY POINT (เทียบเท่า doPost) ======
// เส้นทาง: POST /api/events/:event_code/photos
app.post(
  "/api/events/:event_code/photos",
  upload.fields([
    { name: "original_file", maxCount: 1 },
    { name: "thumb_file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // --- เช็ค api_key ---
      const apiKeyFromQuery = req.query.api_key;
      const apiKeyFromBody = req.body.api_key;
      const clientApiKey = apiKeyFromQuery || apiKeyFromBody || null;

      if (EXPECTED_API_KEY && clientApiKey !== EXPECTED_API_KEY) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid API key" });
      }

      // --- mapping ตาม Apps Script ---
      const originalFile =
        req.files && req.files.original_file
          ? req.files.original_file[0]
          : null;
      const thumbFile =
        req.files && req.files.thumb_file ? req.files.thumb_file[0] : null;

      if (!originalFile) {
        return res
          .status(400)
          .json({ success: false, message: "original_file is required" });
      }

      const originalName =
        req.body.original_name || originalFile.originalname || "photo";
      const localPath = req.body.local_path || "";
      const shotAt = req.body.shot_at || "";
      const checksum = req.body.checksum || null;

      const eventCode = req.params.event_code || "unknown";

      // สร้าง photo_id
      const photoId = uuidv4();

      // เตรียม key บน S3
      // const datePrefix = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      // const baseKey = `events/${eventCode}/${datePrefix}/${photoId}`;
      const baseKey = `events/${eventCode}/${photoId}`;

      // ====== Process original file based on type ======
      console.log(`Processing file: ${originalName}`);
      let processedOriginal;
      try {
        processedOriginal = await processImage(originalFile, originalName);
        console.log(`File processed successfully. Processed: ${processedOriginal.processed}`);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `File processing failed: ${error.message}`
        });
      }

      // ====== Upload processed original ======
      const originalKey = `${baseKey}_original.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: originalKey,
          Body: processedOriginal.buffer,
          ContentType: processedOriginal.mimetype,
        })
      );

      // ====== Process and upload thumbnail (ถ้ามี) ======
      let thumbKey = null;
      if (thumbFile) {
        console.log(`Processing thumbnail file: ${thumbFile.originalname}`);
        let processedThumb;
        try {
          processedThumb = await processImage(thumbFile, thumbFile.originalname);
          console.log(`Thumbnail processed successfully. Processed: ${processedThumb.processed}`);
        } catch (error) {
          console.error(`Thumbnail processing failed:`, error);
          // Continue without thumbnail if processing fails
        }

        if (processedThumb) {
          thumbKey = `${baseKey}_thumb.jpg`;
          await s3.send(
            new PutObjectCommand({
              Bucket: S3_BUCKET,
              Key: thumbKey,
              Body: processedThumb.buffer,
              ContentType: processedThumb.mimetype,
            })
          );
        }
      }

      // Generate presigned URLs for the new photo
      let displayUrl = null;
      let downloadUrl = null;

      // Use thumbnail if available, otherwise use original
      const displayKey = thumbKey || originalKey;
      if (displayKey) {
        const displayCommand = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: displayKey,
        });
        displayUrl = await getSignedUrl(s3, displayCommand, {
          expiresIn: 3600,
        });
      }

      if (originalKey) {
        const originalCommand = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: originalKey,
        });
        downloadUrl = await getSignedUrl(s3, originalCommand, {
          expiresIn: 3600,
        });
      }

      // Prepare photo data for SSE broadcast
      const photoData = {
        photoId,
        displayUrl,
        downloadUrl,
        lastModified: new Date().toISOString(),
        original_name: originalName,
        local_path: localPath,
        shot_at: shotAt,
        checksum: checksum,
      };

      // Broadcast photo update to all connected clients
      broadcastPhotoUpdate(eventCode, photoData);

      // ====== Response รูปแบบเดียวกับ Apps Script ======
      return res.json({
        success: true,
        message: "Photo uploaded successfully",
        photo_id: photoId,
        s3: {
          original_key: originalKey,
          thumb_key: thumbKey,
          bucket: S3_BUCKET,
          region: AWS_REGION,
        },
        meta: {
          original_name: originalName,
          local_path: localPath,
          shot_at: shotAt,
          checksum: checksum,
          event_code: eventCode,
          processed: processedOriginal.processed,
          original_format: processedOriginal.originalFormat || null,
        },
      });
    } catch (err) {
      console.error("Server error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error: " + err.message,
        photo_id: null,
      });
    }
  }
);


// Helper function to broadcast photo updates to all connected clients for an event
function broadcastPhotoUpdate(eventCode, photoData) {
  const connections = sseConnections.get(eventCode);
  if (!connections || connections.size === 0) {
    console.log(`No active SSE connections for event: ${eventCode}`);
    return;
  }

  const message = JSON.stringify({
    type: "photo_update",
    eventCode,
    photo: photoData
  });

  console.log(`Broadcasting photo update to ${connections.size} clients for event: ${eventCode}`);

  connections.forEach((res) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch (error) {
      console.error("Error sending SSE message:", error);
      // Remove dead connection
      connections.delete(res);
    }
  });
}

app.get("/api/health", (req, res) => {
  const apiKeyFromQuery = req.query.api_key;
  const clientApiKey = apiKeyFromQuery || null;

  if (EXPECTED_API_KEY && clientApiKey !== EXPECTED_API_KEY) {
    return res.status(401).json({ success: false, message: "Invalid API key" });
  }

  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/:event_code/photos/stream", (req, res) => {
  const eventCode = req.params.event_code;

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  console.log(`New SSE connection for event: ${eventCode}`);

  // Add connection to the event's connection pool
  if (!sseConnections.has(eventCode)) {
    sseConnections.set(eventCode, new Set());
  }
  sseConnections.get(eventCode).add(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", eventCode })}\n\n`);

  // Handle client disconnect
  req.on("close", () => {
    console.log(`SSE connection closed for event: ${eventCode}`);
    const connections = sseConnections.get(eventCode);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(eventCode);
      }
    }
  });

  // Send periodic heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
  }, 30000); // 30 seconds

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

app.get("/:event_code/photos/:photoId", async (req, res) => {
  const photoId = req.params.photoId;
  const eventCode = req.params.event_code;

  if (!eventCode) {
    return res
      .status(400)
      .json({
        success: false,
        message: "eventCode query parameter is required",
      });
  }

  try {
    const key = `events/${eventCode}/${photoId}_original.jpg`;
    // เปลี่ยน key ตามโครงสร้างจริงของคุณ

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const data = await s3.send(command);

    // อ่าน stream เป็น buffer
    const chunks = [];
    for await (const chunk of data.Body) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    // แปลงเป็น base64
    const base64 = buffer.toString("base64");

    res.json({
      success: true,
      photoId,
      base64: `data:image/jpeg;base64,${base64}`,
    });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ success: false, message: "Download failed" });
  }
});

// ====== PHOTO GALLERY ROUTE ======
// เส้นทาง: GET /:event_code/photos
app.get("/:event_code/photos", async (req, res) => {
  try {
    const eventCode = req.params.event_code;
    const page = parseInt(req.query.page) || 1;
    const limit = 20; // 20 photos per page
    const offset = (page - 1) * limit;

    console.log(`Fetching photos for event: ${eventCode}`);

    // ค้นหารูปภาพใน S3
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: `events/${eventCode}/`,
      MaxKeys: 1000, // ดึงข้อมูลมาเยอะๆ เพื่อทำ pagination
    });

    const s3Response = await s3.send(listCommand);
    const objects = s3Response.Contents || [];

    console.log(
      `Found ${objects.length} objects in S3 for prefix: events/${eventCode}/`
    );
    console.log(
      "Objects:",
      objects.map((obj) => obj.Key)
    );

    // กรองเฉพาะไฟล์รูปภาพ (original และ thumb)
    const photoObjects = objects.filter(
      (obj) =>
        obj.Key.includes("_original.jpg") || obj.Key.includes("_thumb.jpg")
    );

    console.log(`Filtered photo objects: ${photoObjects.length}`);
    console.log(
      "Photo objects:",
      photoObjects.map((obj) => obj.Key)
    );

    // จัดกลุ่มตาม photo_id
    const photoGroups = {};
    photoObjects.forEach((obj) => {
      const keyParts = obj.Key.split("/");
      const fileName = keyParts[keyParts.length - 1];
      const photoId = fileName.split("_")[0];

      if (!photoGroups[photoId]) {
        photoGroups[photoId] = {};
      }

      if (fileName.includes("_thumb.jpg")) {
        photoGroups[photoId].thumb = obj;
      } else if (fileName.includes("_original.jpg")) {
        photoGroups[photoId].original = obj;
      }
    });

    console.log("Photo groups:", Object.keys(photoGroups));

    // แปลงเป็น array และเรียงตามวันที่ล่าสุด
    const photos = Object.keys(photoGroups)
      .map((photoId) => ({
        photoId,
        ...photoGroups[photoId],
      }))
      .sort((a, b) => {
        const dateA =
          a.original?.LastModified || a.thumb?.LastModified || new Date(0);
        const dateB =
          b.original?.LastModified || b.thumb?.LastModified || new Date(0);
        return dateB - dateA;
      });

    console.log(`Total photos grouped: ${photos.length}`);

    // ทำ pagination
    const totalPhotos = photos.length;
    const totalPages = Math.ceil(totalPhotos / limit);
    const paginatedPhotos = photos.slice(offset, offset + limit);

    console.log(`Paginated photos for page ${page}: ${paginatedPhotos.length}`);

    // สร้าง presigned URLs สำหรับแสดงรูปและดาวน์โหลด
    const photosWithUrls = await Promise.all(
      paginatedPhotos.map(async (photo) => {
        const thumbKey = photo.thumb?.Key;
        const originalKey = photo.original?.Key;

        console.log(
          `Processing photo ${photo.photoId}: thumb=${thumbKey}, original=${originalKey}`
        );

        let displayUrl = null;
        let downloadUrl = null;

        // ใช้ original แทน thumb ถ้าไม่มี thumbnail
        const displayKey = thumbKey || originalKey;

        if (displayKey) {
          try {
            const displayCommand = new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: displayKey,
            });
            displayUrl = await getSignedUrl(s3, displayCommand, {
              expiresIn: 3600,
            });
            console.log(
              `Generated display URL for ${
                photo.photoId
              }: ${displayUrl.substring(0, 100)}...`
            );
          } catch (error) {
            console.error(
              `Error generating display URL for ${photo.photoId}:`,
              error
            );
          }
        }

        if (originalKey) {
          try {
            const originalCommand = new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: originalKey,
            });
            downloadUrl = await getSignedUrl(s3, originalCommand, {
              expiresIn: 3600,
            });
            console.log(
              `Generated download URL for ${
                photo.photoId
              }: ${downloadUrl.substring(0, 100)}...`
            );
          } catch (error) {
            console.error(
              `Error generating download URL for ${photo.photoId}:`,
              error
            );
          }
        }

        return {
          photoId: photo.photoId,
          displayUrl,
          downloadUrl,
          lastModified:
            photo.original?.LastModified || photo.thumb?.LastModified,
        };
      })
    );

    console.log(
      "Photos with URLs:",
      photosWithUrls.map((p) => ({
        id: p.photoId,
        hasDisplay: !!p.displayUrl,
        hasDownload: !!p.downloadUrl,
      }))
    );

    console.log(`Final photos with URLs: ${photosWithUrls.length}`);
    console.log(
      "Photos with URLs:",
      photosWithUrls.map((p) => ({
        id: p.photoId,
        hasThumb: !!p.thumbUrl,
        hasDownload: !!p.downloadUrl,
      }))
    );

    // สร้าง HTML template
    const html = `
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
            ${photosWithUrls
              .map(
                (photo) => `
            <div class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
              <div class="aspect-square relative group cursor-pointer m-2 border rounded-lg overflow-hidden" onclick="openModal('${
                photo.displayUrl || photo.downloadUrl
              }')">
                ${
                  photo.displayUrl || photo.downloadUrl
                    ? `
                  <img src="${
                    photo.displayUrl || photo.downloadUrl
                  }" alt="Photo ${photo.photoId}"
                      class="w-full h-full object-cover"
                      loading="lazy">

                  <!-- Eye icon in center on hover -->
                  <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none">
                    <svg class="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  </div>
                `
                    : `
                  <div class="w-full h-full bg-gray-200 flex items-center justify-center">
                    <span class="text-gray-500">No image</span>
                  </div>
                `
                }
              </div>
              <div class="p-3 flex justify-between items-center">
                <div class="min-w-0 flex-1 mr-2">
                  <p class="text-xs text-gray-500 truncate" title="ID: ${
                    photo.photoId
                  }">ID: ${photo.photoId}</p>
                  <p class="text-xs text-gray-400 truncate" title="${
                    photo.lastModified
                      ? new Date(photo.lastModified).toLocaleString("th-TH")
                      : ""
                  }">
                    ${
                      photo.lastModified
                        ? new Date(photo.lastModified).toLocaleString("th-TH")
                        : ""
                    }
                  </p>
                </div>
                ${
                  photo.downloadUrl
                    ? `
                  <button onclick="downloadPhoto('/${eventCode}/photos/${photo.photoId}', '${photo.photoId}')"
                    class="flex-shrink-0 text-black px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors duration-200 flex items-center">
                    <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                  </button>
                  `
                    : ""
                }
              </div>
            </div>
          `
              )
              .join("")}
          </div>

          <!-- Pagination -->
          ${
            totalPages > 1
              ? `
            <div class="flex justify-center items-center space-x-2">
              ${
                page > 1
                  ? `
                <a href="?page=${page - 1}"
                   class="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700">
                  Previous
                </a>
              `
                  : ""
              }

              <div class="flex space-x-1">
                ${Array.from({ length: totalPages }, (_, i) => i + 1)
                  .map(
                    (p) => `
                  <a href="?page=${p}"
                     class="px-3 py-2 ${
                       p === page
                         ? "bg-blue-500 text-white"
                         : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                     } rounded-md text-sm font-medium">
                    ${p}
                  </a>
                `
                  )
                  .join("")}
              </div>

              ${
                page < totalPages
                  ? `
                <a href="?page=${page + 1}"
                   class="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700">
                  Next
                </a>
              `
                  : ""
              }
            </div>
          `
              : ""
          }
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

      <script>
        // Function declarations first (hoisted)
        function openModal(imageSrc) {
          const modal = document.getElementById('imageModal');
          const modalImg = document.getElementById('modalImage');
          modal.classList.add('active');
          modalImg.src = imageSrc;
        }

        function closeModal() {
          const modal = document.getElementById('imageModal');
          modal.classList.remove('active');
        }

        function showNotification(message, type = 'info') {
          // Create notification element
          const notification = document.createElement('div');
          notification.className = 'fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 transform transition-all duration-300 translate-x-full';

          // Set color based on type
          switch(type) {
            case 'success':
              notification.classList.add('bg-green-500', 'text-white');
              break;
            case 'error':
              notification.classList.add('bg-red-500', 'text-white');
              break;
            case 'warning':
              notification.classList.add('bg-yellow-500', 'text-white');
              break;
            default:
              notification.classList.add('bg-blue-500', 'text-white');
          }

          notification.textContent = message;
          document.body.appendChild(notification);

          // Animate in
          setTimeout(() => {
            notification.classList.remove('translate-x-full');
            notification.classList.add('translate-x-0');
          }, 100);

          // Remove after 3 seconds
          setTimeout(() => {
            notification.classList.remove('translate-x-0');
            notification.classList.add('translate-x-full');
            setTimeout(() => {
              document.body.removeChild(notification);
            }, 300);
          }, 3000);
        }

        async function downloadPhoto(downloadUrl, photoId) {
          try {
            const res = await fetch(downloadUrl);
            const data = await res.json();

            if (data.success && data.base64) {
              // สร้าง link สำหรับดาวน์โหลดจาก base64
              const link = document.createElement('a');
              link.href = data.base64;
              link.download = 'photo_' + photoId + '.jpg';

              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } else {
              throw new Error('Invalid response from server');
            }

          } catch (e) {
            console.error("Download error:", e);
            alert("ไม่สามารถดาวน์โหลดไฟล์ได้");
          }
        }

        // SSE connection for real-time updates
        let eventSource = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        const reconnectDelay = 3000; // 3 seconds

        function connectSSE() {
          const eventCode = '${eventCode}';
          const streamUrl = '/' + eventCode + '/photos/stream';

          console.log('Connecting to SSE stream:', streamUrl);

          eventSource = new EventSource(streamUrl);

          eventSource.onopen = function(event) {
            console.log('SSE connection opened');
            reconnectAttempts = 0;
            showNotification('เชื่อมต่อแบบเรียลไทม์แล้ว', 'success');
          };

          eventSource.onmessage = function(event) {
            try {
              const data = JSON.parse(event.data);
              console.log('SSE message received:', data);

              if (data.type === 'photo_update') {
                handleNewPhoto(data.photo);
              } else if (data.type === 'heartbeat') {
                console.log('SSE heartbeat received');
              } else if (data.type === 'connected') {
                console.log('SSE connection confirmed for event:', data.eventCode);
              }
            } catch (error) {
              console.error('Error parsing SSE message:', error);
            }
          };

          eventSource.onerror = function(event) {
            console.error('SSE connection error:', event);
            eventSource.close();

            if (reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              console.log('Attempting to reconnect (' + reconnectAttempts + '/' + maxReconnectAttempts + ')...');
              showNotification('พยายามเชื่อมต่อใหม่... (' + reconnectAttempts + '/' + maxReconnectAttempts + ')', 'warning');
              setTimeout(connectSSE, reconnectDelay);
            } else {
              console.error('Max reconnection attempts reached');
              showNotification('ไม่สามารถเชื่อมต่อแบบเรียลไทม์ได้ กรุณารีเฟรชหน้า', 'error');
            }
          };
        }

        function handleNewPhoto(photoData) {
          console.log('New photo received:', photoData);

          // Create the photo element directly as a DOM node (not as HTML string)
          const photoElement = createPhotoElementDOM(photoData, '${eventCode}');

          // Add to the beginning of the photo grid
          const photoGrid = document.querySelector('.photo-grid');
          if (photoGrid) {
            photoGrid.insertBefore(photoElement, photoGrid.firstChild);

            // Update total photos count
            const totalPhotosElement = document.querySelector('p:has(span.font-semibold)');
            if (totalPhotosElement) {
              const textContent = totalPhotosElement.textContent || totalPhotosElement.innerText;
              const match = textContent.match(/Total:\s*(\d+)\s*photos?/);
              if (match && match[1]) {
                const currentTotal = parseInt(match[1]);
                totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: ' + (currentTotal + 1) + ' photos';
              } else {
                // If regex doesn't match, try to find the number in a different way
                const numbers = textContent.match(/\d+/);
                if (numbers && numbers[0]) {
                  const currentTotal = parseInt(numbers[0]);
                  totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: ' + (currentTotal + 1) + ' photos';
                } else {
                  // Fallback: just add a new count
                  totalPhotosElement.innerHTML = 'Total: <span class="font-semibold">' + eventCode + '</span><br>Total: 1 photos';
                }
              }
            }

            // Show notification
            showNotification('มีรูปใหม่!', 'success');

            // Highlight the new photo
            photoElement.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-75');
            setTimeout(() => {
              photoElement.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-75');
            }, 3000);
          }
        }

        function createPhotoElement(photoData) {
          // This function is only used for the initial page load
          // It returns HTML string as before
          const eventCode = '${eventCode}';
          const imageUrl = photoData.displayUrl || photoData.downloadUrl;
          const photoId = photoData.photoId;
          const lastModified = photoData.lastModified ? new Date(photoData.lastModified).toLocaleString('th-TH') : '';
          const downloadUrl = photoData.downloadUrl;

          // Create a container element
          const photoDiv = document.createElement('div');
          photoDiv.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300';

          // Create the image container
          const imageContainer = document.createElement('div');
          imageContainer.className = 'aspect-square relative group cursor-pointer m-2 border rounded-lg overflow-hidden';
          imageContainer.setAttribute('onclick', 'openModal(\"" + imageUrl + "\")');

          if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'Photo ' + photoId;
            img.className = 'w-full h-full object-cover';
            img.loading = 'lazy';

            // Create hover overlay
            const hoverOverlay = document.createElement('div');
            hoverOverlay.className = 'absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none';

            const eyeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            eyeIcon.setAttribute('class', 'w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300');
            eyeIcon.setAttribute('fill', 'none');
            eyeIcon.setAttribute('stroke', 'currentColor');
            eyeIcon.setAttribute('viewBox', '0 0 24 24');

            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('stroke-linecap', 'round');
            path1.setAttribute('stroke-linejoin', 'round');
            path1.setAttribute('stroke-width', '2');
            path1.setAttribute('d', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z');

            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('stroke-linecap', 'round');
            path2.setAttribute('stroke-linejoin', 'round');
            path2.setAttribute('stroke-width', '2');
            path2.setAttribute('d', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z');

            eyeIcon.appendChild(path1);
            eyeIcon.appendChild(path2);
            hoverOverlay.appendChild(eyeIcon);

            imageContainer.appendChild(img);
            imageContainer.appendChild(hoverOverlay);
          } else {
            const noImageDiv = document.createElement('div');
            noImageDiv.className = 'w-full h-full bg-gray-200 flex items-center justify-center';
            const noImageSpan = document.createElement('span');
            noImageSpan.className = 'text-gray-500';
            noImageSpan.textContent = 'No image';
            noImageDiv.appendChild(noImageSpan);
            imageContainer.appendChild(noImageDiv);
          }

          // Create the info container
          const infoContainer = document.createElement('div');
          infoContainer.className = 'p-3 flex justify-between items-center';

          const textInfo = document.createElement('div');
          textInfo.className = 'min-w-0 flex-1 mr-2';

          const idPara = document.createElement('p');
          idPara.className = 'text-xs text-gray-500 truncate';
          idPara.title = 'ID: ' + photoId;
          idPara.textContent = 'ID: ' + photoId;

          const datePara = document.createElement('p');
          datePara.className = 'text-xs text-gray-400 truncate';
          datePara.title = lastModified;
          datePara.textContent = lastModified;

          textInfo.appendChild(idPara);
          textInfo.appendChild(datePara);

          infoContainer.appendChild(textInfo);

          if (downloadUrl) {
            const downloadButton = document.createElement('button');
            downloadButton.className = 'flex-shrink-0 text-black px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors duration-200 flex items-center';
            downloadButton.setAttribute('onclick', 'downloadPhoto(\"/" + eventCode + "/photos/" + photoId + "\", \" + photoId + "\")');

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'w-5 h-5 mr-1');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('viewBox', '0 0 24 24');

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('d', 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4');

            svg.appendChild(path);
            downloadButton.appendChild(svg);
            infoContainer.appendChild(downloadButton);
          }

          photoDiv.appendChild(imageContainer);
          photoDiv.appendChild(infoContainer);

          return photoDiv.outerHTML;
        }

        function createPhotoElementDOM(photoData, eventCode) {
          // This function is used for dynamically added photos via SSE
          // It returns a DOM element with proper event listeners
          const imageUrl = photoData.displayUrl || photoData.downloadUrl;
          const photoId = photoData.photoId;
          const lastModified = photoData.lastModified ? new Date(photoData.lastModified).toLocaleString('th-TH') : '';
          const downloadUrl = photoData.downloadUrl;

          // Create a container element
          const photoDiv = document.createElement('div');
          photoDiv.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300';

          // Create the image container
          const imageContainer = document.createElement('div');
          imageContainer.className = 'aspect-square relative group cursor-pointer m-2 border rounded-lg overflow-hidden';
          imageContainer.addEventListener('click', function() {
            openModal(imageUrl);
          });

          if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'Photo ' + photoId;
            img.className = 'w-full h-full object-cover';
            img.loading = 'lazy';

            // Create hover overlay
            const hoverOverlay = document.createElement('div');
            hoverOverlay.className = 'absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none';

            const eyeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            eyeIcon.setAttribute('class', 'w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300');
            eyeIcon.setAttribute('fill', 'none');
            eyeIcon.setAttribute('stroke', 'currentColor');
            eyeIcon.setAttribute('viewBox', '0 0 24 24');

            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('stroke-linecap', 'round');
            path1.setAttribute('stroke-linejoin', 'round');
            path1.setAttribute('stroke-width', '2');
            path1.setAttribute('d', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z');

            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('stroke-linecap', 'round');
            path2.setAttribute('stroke-linejoin', 'round');
            path2.setAttribute('stroke-width', '2');
            path2.setAttribute('d', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z');

            eyeIcon.appendChild(path1);
            eyeIcon.appendChild(path2);
            hoverOverlay.appendChild(eyeIcon);

            imageContainer.appendChild(img);
            imageContainer.appendChild(hoverOverlay);
          } else {
            const noImageDiv = document.createElement('div');
            noImageDiv.className = 'w-full h-full bg-gray-200 flex items-center justify-center';
            const noImageSpan = document.createElement('span');
            noImageSpan.className = 'text-gray-500';
            noImageSpan.textContent = 'No image';
            noImageDiv.appendChild(noImageSpan);
            imageContainer.appendChild(noImageDiv);
          }

          // Create the info container
          const infoContainer = document.createElement('div');
          infoContainer.className = 'p-3 flex justify-between items-center';

          const textInfo = document.createElement('div');
          textInfo.className = 'min-w-0 flex-1 mr-2';

          const idPara = document.createElement('p');
          idPara.className = 'text-xs text-gray-500 truncate';
          idPara.title = 'ID: ' + photoId;
          idPara.textContent = 'ID: ' + photoId;

          const datePara = document.createElement('p');
          datePara.className = 'text-xs text-gray-400 truncate';
          datePara.title = lastModified;
          datePara.textContent = lastModified;

          textInfo.appendChild(idPara);
          textInfo.appendChild(datePara);

          infoContainer.appendChild(textInfo);

          if (downloadUrl) {
            const downloadButton = document.createElement('button');
            downloadButton.className = 'flex-shrink-0 text-black px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors duration-200 flex items-center';
            downloadButton.addEventListener('click', function() {
              downloadPhoto('/' + eventCode + '/photos/' + photoId, photoId);
            });

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'w-5 h-5 mr-1');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('viewBox', '0 0 24 24');

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('d', 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4');

            svg.appendChild(path);
            downloadButton.appendChild(svg);
            infoContainer.appendChild(downloadButton);
          }

          photoDiv.appendChild(imageContainer);
          photoDiv.appendChild(infoContainer);

          return photoDiv;
        }

        // Initialize SSE connection when page loads
        document.addEventListener('DOMContentLoaded', function() {
          connectSSE();

          // Set up modal event listeners
          const modal = document.getElementById('imageModal');
          if (modal) {
            modal.addEventListener('click', function(event) {
              if (event.target === this) {
                closeModal();
              }
            });
          }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(event) {
          if (event.key === 'Escape') {
            closeModal();
          }
        });

        // Cleanup SSE connection when page unloads
        window.addEventListener('beforeunload', function() {
          if (eventSource) {
            eventSource.close();
          }
        });
      </script>
    </body>
    </html>
    `;

    res.send(html);
  } catch (err) {
    console.error("Error fetching photos:", err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h1 class="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p class="text-gray-700">Failed to load photos: ${err.message}</p>
          <a href="javascript:history.back()" class="mt-4 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Go Back
          </a>
        </div>
      </body>
      </html>
    `);
  }
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Photo upload test server running on http://localhost:${PORT}`);
});
