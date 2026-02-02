import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { Readable } from "stream";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

// File type detection
const FILE_TYPES = {
  IMAGE: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/tiff",
    "image/gif",
    "image/avif",
  ],
  VIDEO: [
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "video/x-matroska",
  ],
  PDF: ["application/pdf"],
};

// Preview configuration
const CONFIG = {
  image: {
    width: 300,
    height: 300,
    quality: 80,
    format: "webp",
  },
  video: {
    width: 640,
    height: 360,
    quality: 85,
    format: "webp",
    timestamp: "00:00:01",
  },
  pdf: {
    width: 400,
    height: 565,
    quality: 80,
    format: "webp",
  },
};

/**
 * Convert S3 stream to buffer
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Generate image preview using Sharp
 */
async function generateImagePreview(imageBuffer, mimeType) {
  console.log("Generating image preview...");

  try {
    let sharpInstance = sharp(imageBuffer);

    if (mimeType === "image/heic" || mimeType === "image/heif") {
      sharpInstance = sharpInstance.heif();
    }

    const preview = await sharpInstance
      .resize(CONFIG.image.width, CONFIG.image.height, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CONFIG.image.quality })
      .toBuffer();

    return {
      buffer: preview,
      format: CONFIG.image.format,
      mimeType: `image/${CONFIG.image.format}`,
    };
  } catch (error) {
    throw new Error(`Image preview generation failed: ${error.message}`);
  }
}

/**
 * Generate video thumbnail using FFmpeg
 */
async function generateVideoPreview(videoBuffer, mimeType) {
  console.log("Generating video thumbnail...");

  const inputPath = `/tmp/input-${Date.now()}.mp4`;
  const outputPath = `/tmp/thumbnail-${Date.now()}.jpg`;

  try {
    writeFileSync(inputPath, videoBuffer);

    const ffmpegPath = existsSync("/opt/bin/ffmpeg")
      ? "/opt/bin/ffmpeg"
      : "ffmpeg";

    const result = spawnSync(
      ffmpegPath,
      [
        "-i",
        inputPath,
        "-ss",
        CONFIG.video.timestamp,
        "-vframes",
        "1",
        "-vf",
        `scale=${CONFIG.video.width}:${CONFIG.video.height}:force_original_aspect_ratio=decrease`,
        "-q:v",
        "2",
        outputPath,
      ],
      {
        encoding: "buffer",
        maxBuffer: 50 * 1024 * 1024,
      }
    );

    if (result.status !== 0) {
      const error = result.stderr.toString();
      throw new Error(`FFmpeg failed: ${error}`);
    }

    const thumbnail = readFileSync(outputPath);

    // Convert to WebP for better compression
    const optimized = await sharp(thumbnail)
      .webp({ quality: CONFIG.video.quality })
      .toBuffer();

    return {
      buffer: optimized,
      format: CONFIG.video.format,
      mimeType: `image/${CONFIG.video.format}`,
    };
  } catch (error) {
    throw new Error(`Video preview generation failed: ${error.message}`);
  } finally {
    try {
      if (existsSync(inputPath)) unlinkSync(inputPath);
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
}

/**
 * Generate PDF preview
 */
async function generatePDFPreview(pdfBuffer) {
  console.log("Generating PDF preview...");

  try {
    // For production, use a library like pdf2pic or pdfjs-dist
    // This is a placeholder implementation
    const preview = await sharp({
      create: {
        width: CONFIG.pdf.width,
        height: CONFIG.pdf.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .webp({ quality: CONFIG.pdf.quality })
      .toBuffer();

    return {
      buffer: preview,
      format: CONFIG.pdf.format,
      mimeType: `image/${CONFIG.pdf.format}`,
    };
  } catch (error) {
    throw new Error(`PDF preview generation failed: ${error.message}`);
  }
}

/**
 * Upload preview to S3
 */
async function uploadPreview(bucket, previewKey, previewBuffer, mimeType) {
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: previewKey,
    Body: previewBuffer,
    ContentType: mimeType,
    CacheControl: "public, max-age=31536000",
    Metadata: {
      generatedBy: "lambda-preview-generator",
      generatedAt: new Date().toISOString(),
    },
  });

  await s3Client.send(putCommand);
  console.log(`Preview uploaded to: ${previewKey}`);
}

/**
 * Determine file type from MIME type
 */
function getFileType(mimeType) {
  if (FILE_TYPES.IMAGE.includes(mimeType)) return "image";
  if (FILE_TYPES.VIDEO.includes(mimeType)) return "video";
  if (FILE_TYPES.PDF.includes(mimeType)) return "pdf";
  return null;
}

/**
 * Generate preview based on file type
 */
async function generatePreview(buffer, mimeType, fileType) {
  switch (fileType) {
    case "image":
      return await generateImagePreview(buffer, mimeType);
    case "video":
      return await generateVideoPreview(buffer, mimeType);
    case "pdf":
      return await generatePDFPreview(buffer);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Generate preview key from original key
 * Input:  users/123/files/abc-123/original
 * Output: users/123/files/abc-123/preview.webp
 */
function generatePreviewKey(originalKey) {
  const basePath = originalKey.substring(0, originalKey.lastIndexOf("/"));
  return `${basePath}/preview.webp`;
}

/**
 * Notify backend about preview generation
 */
async function notifyBackend(fileId, previewKey, fileType, success = true, error = null) {
  if (!process.env.API_URL || !process.env.API_KEY) {
    console.log("API_URL or API_KEY not set, skipping webhook notification");
    return;
  }

  try {
    const payload = {
      previewKey,
      fileType,
      status: success ? "ready" : "failed",
      generatedAt: new Date().toISOString(),
    };

    if (error) {
      payload.error = error;
    }

    const response = await fetch(
      `${process.env.API_URL}/api/files/${fileId}/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    console.log(`Successfully notified backend for fileId: ${fileId}`);
  } catch (error) {
    console.error("Failed to notify backend:", error);
  }
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const results = {
    processed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const record of event.Records) {
    let fileId = null;

    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

      console.log(`Processing file: ${key}`);

      // Only process files ending with /original
      if (!key.endsWith("/original")) {
        console.log("Skipping: Not an original file");
        results.skipped++;
        continue;
      }

      // Get object metadata
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(getCommand);
      const mimeType = response.ContentType;
      const fileType = getFileType(mimeType);

      // Extract fileId from metadata
      fileId = response.Metadata?.fileid;

      if (!fileType) {
        console.log(`Unsupported file type: ${mimeType}`);
        results.skipped++;
        continue;
      }

      if (!fileId) {
        console.warn("No fileId in metadata");
      }

      console.log(`Processing ${fileType} with MIME: ${mimeType}`);

      // Download file
      const fileBuffer = await streamToBuffer(response.Body);
      console.log(`Downloaded: ${fileBuffer.length} bytes`);

      // Generate preview
      const { buffer: previewBuffer, format, mimeType: previewMimeType } =
        await generatePreview(fileBuffer, mimeType, fileType);

      console.log(`Generated preview: ${previewBuffer.length} bytes`);

      // Generate preview key
      const previewKey = generatePreviewKey(key);

      // Upload preview
      await uploadPreview(bucket, previewKey, previewBuffer, previewMimeType);

      // Notify backend - SUCCESS
      if (fileId) {
        await notifyBackend(fileId, previewKey, fileType, true, null);
      }

      console.log(`✓ Successfully processed: ${key}`);
      results.processed++;
    } catch (error) {
      console.error(`✗ Error processing record:`, error);

      // Notify backend - FAILED
      if (fileId) {
        await notifyBackend(fileId, null, null, false, error.message);
      }

      results.failed++;
      continue;
    }
  }

  console.log("Processing complete:", results);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Preview generation completed",
      results,
    }),
  };
};