import File from "../models/File.model.js";
import User from "../models/User.model.js";
import { S3Storage } from "../infra/s3.storage.js";
import Folder from "../models/Folder.model.js";

const storage = new S3Storage();

export class FileService {
  /**
   * Create upload intent - generates presigned URL for direct S3 upload
   */
  static async createUploadIntent(user, dto) {
    const { filename, mimeType, size, parentFolderId, tags, description } = dto;

    // Validate required fields
    if (!filename || !mimeType || !size) {
      throw new Error("Missing required fields: filename, mimeType, size");
    }

    // Check storage quota
    const dbUser = await User.findById(user.id).select(
      "storageUsed storageLimit",
    );

    if (!dbUser) {
      throw new Error("User not found");
    }

    if (dbUser.storageUsed + size > dbUser.storageLimit) {
      throw new Error("Storage quota exceeded");
    }

    // Validate parent folder
    const folder = await Folder.findOne({
      _id: parentFolderId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!folder) {
      throw new Error("Invalid folder");
    }

    // Create file record
    const file = await File.create({
      ownerId: user.id,
      parentFolderId: folder._id,
      fileName: filename,
      mimeType,
      size,
      status: "pending",
      tags: tags || [],
      description: description || "",
      hasPreview: false,
      previewStatus: this.isPreviewSupported(mimeType) ? "processing" : "none",
    });

    // Generate S3 key with file._id for better organization
    file.s3Key = `users/${user.id}/files/${file._id}/original`;
    await file.save();
    // Generate presigned upload URL
    const uploadUrl = await storage.getUploadUrl({
      key: file.s3Key,
      mimeType,
      metadata: {
        fileId: file._id.toString(),
        ownerId: user.id.toString(),
      },
    });

    return {
      uploadUrl,
      fileId: file._id,
    };
  }

  /**
   * Confirm upload after client completes S3 upload
   */
  static async confirmUpload(user, fileId) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      status: "pending",
    });

    if (!file) {
      throw new Error("Invalid or already confirmed upload");
    }

    // Verify object exists in S3
    const head = await storage.headObject(file.s3Key);

    if (!head) {
      throw new Error("File not found in storage");
    }

    // Validate ownership via metadata
    if (head.Metadata?.ownerid !== user.id.toString()) {
      throw new Error("Storage ownership mismatch");
    }

    // Validate size
    const actualSize = head.ContentLength;

    if (actualSize <= 0) {
      throw new Error("Uploaded file is empty");
    }

    // Max size enforcement (50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (actualSize > MAX_SIZE) {
      throw new Error("File exceeds allowed size");
    }

    // Validate MIME type
    if (file.mimeType && head.ContentType !== file.mimeType) {
      throw new Error("MIME type mismatch");
    }

    // Update file with actual values from S3
    file.size = actualSize;
    file.mimeType = head.ContentType;
    file.status = "active";
    await file.save();

    // Update user's storage quota
    await User.findByIdAndUpdate(user.id, {
      $inc: { storageUsed: actualSize },
    });

    return file;
  }

  /**
   * Get batch preview URLs for multiple files
   */
  static async getBatchPreviews(userId, fileIds) {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error("fileIds array required");
    }

    // Find all files with ready previews
    const files = await File.find({
      _id: { $in: fileIds },
      ownerId: userId,
      status: "active",
      isDeleted: false,
      hasPreview: true,
      previewStatus: "ready",
      previewKey: { $exists: true, $ne: null },
    }).select("_id previewKey");

    // Generate signed URLs for all previews in parallel
    const previews = {};
    await Promise.all(
      files.map(async (file) => {
        previews[file._id] = await storage.getDownloadUrl(
          file.previewKey,
          3600,
        );
      }),
    );

    return previews;
  }

  /**
   * Get single file with download and preview URLs
   */
  static async getFile(user, fileId) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Generate download URL
    const downloadUrl = await storage.getDownloadUrl(file.s3Key, 3600);
    let previewUrl = null;

    // Generate preview URL if available
    if (file.hasPreview && file.previewStatus === "ready" && file.previewKey) {
      previewUrl = await storage.getDownloadUrl(file.previewKey, 3600);
    }

    return {
      ...file.toObject(),
      downloadUrl,
      previewUrl,
    };
  }

  /**
   * List files in a folder
   */
  static async listFiles(user, folderId, options = {}) {
    const { limit = 50, skip = 0, includeUrls = true } = options;

    const files = await File.find({
      ownerId: user.id,
      parentFolderId: folderId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    if (!includeUrls) {
      return files;
    }

    // Generate signed URLs for all files
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const downloadUrl = await storage.getDownloadUrl(file.s3Key, 3600);
        let previewUrl = null;

        if (
          file.hasPreview &&
          file.previewStatus === "ready" &&
          file.previewKey
        ) {
          previewUrl = await storage.getDownloadUrl(file.previewKey, 3600);
        }

        return {
          ...file,
          downloadUrl,
          previewUrl,
        };
      }),
    );

    return filesWithUrls;
  }

  /**
   * Webhook endpoint - called by Lambda after preview generation
   */
  static async updatePreview(fileId, previewKey, status = "ready") {
    const file = await File.findById(fileId);

    if (!file) {
      throw new Error("File not found");
    }

    file.previewKey = previewKey;
    file.previewStatus = status;
    file.hasPreview = status === "ready";
    await file.save();

    return file;
  }

  /**
   * Mark preview generation as failed
   */
  static async markPreviewFailed(fileId, error) {
    const file = await File.findById(fileId);

    if (!file) {
      throw new Error("File not found");
    }

    file.previewStatus = "failed";
    file.hasPreview = false;
    await file.save();

    console.error(`Preview generation failed for ${fileId}:`, error);
    return file;
  }

  /**
   * Delete file and its preview
   */
  static async deleteFile(user, fileId) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Only reclaim storage if file was fully uploaded (active status)
    const storageToReclaim = file.status === "active" ? file.size : 0;

    // Soft delete the file and update user storage atomically
    // This prevents race conditions between marking deleted and updating quota
    if (storageToReclaim > 0) {
      const updateResult = await User.findOneAndUpdate(
        {
          _id: user.id,
          // Only update if user has enough storage used to reclaim
          // This prevents negative storage values
          storageUsed: { $gte: storageToReclaim },
        },
        {
          $inc: { storageUsed: -storageToReclaim },
        },
        { new: true },
      );

      if (!updateResult) {
        throw new Error(
          "Failed to update storage quota - possible inconsistency",
        );
      }
    }

    // Mark file as soft deleted
    file.isDeleted = true;
    file.deletedAt = new Date();
    await file.save();

    return {
      success: true,
      storageReclaimed: storageToReclaim,
    };
  }

  /**
   * Batch soft delete files and reclaim storage quota
   * Note: Does not delete from S3 - only marks as deleted and reduces user quota
   */
  static async batchDeleteFiles(user, fileIds) {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error("fileIds array required");
    }

    const files = await File.find({
      _id: { $in: fileIds },
      ownerId: user.id,
      isDeleted: false,
    });

    if (files.length === 0) {
      throw new Error("No valid files found");
    }

    const results = {
      deleted: 0,
      failed: 0,
      totalSizeReclaimed: 0,
    };

    // Calculate total storage to reclaim
    for (const file of files) {
      if (file.status === "active") {
        results.totalSizeReclaimed += file.size;
      }
    }

    // Update user's storage quota first (atomic operation)
    if (results.totalSizeReclaimed > 0) {
      const updateResult = await User.findOneAndUpdate(
        {
          _id: user.id,
          storageUsed: { $gte: results.totalSizeReclaimed },
        },
        {
          $inc: { storageUsed: -results.totalSizeReclaimed },
        },
        { new: true },
      );

      if (!updateResult) {
        throw new Error(
          "Failed to update storage quota - possible inconsistency",
        );
      }
    }

    // Now soft delete all files
    const deleteResults = await Promise.allSettled(
      files.map(async (file) => {
        file.isDeleted = true;
        file.deletedAt = new Date();
        await file.save();
      }),
    );

    // Count successes and failures
    deleteResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.deleted++;
      } else {
        results.failed++;
        console.error("Error soft deleting file:", result.reason);
      }
    });

    // If any deletions failed, we need to rollback the storage quota
    if (results.failed > 0) {
      // Calculate how much to rollback (for failed deletions)
      let rollbackAmount = 0;
      deleteResults.forEach((result, index) => {
        if (result.status === "rejected" && files[index].status === "active") {
          rollbackAmount += files[index].size;
        }
      });

      if (rollbackAmount > 0) {
        await User.findByIdAndUpdate(user.id, {
          $inc: { storageUsed: rollbackAmount },
        });
        results.totalSizeReclaimed -= rollbackAmount;
      }
    }

    return results;
  }

  /**
   * Move file to different folder
   */
  static async moveFile(user, fileId, newFolderId) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    // Validate new folder
    const folder = await Folder.findOne({
      _id: newFolderId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!folder) {
      throw new Error("Invalid destination folder");
    }

    file.parentFolderId = folder._id;
    await file.save();

    return file;
  }

  /**
   * Rename file
   */
  static async renameFile(user, fileId, newFileName) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    file.fileName = newFileName.trim();
    await file.save();

    return file;
  }

  /**
   * Update file tags
   */
  static async updateTags(user, fileId, tags) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    if (!Array.isArray(tags)) {
      throw new Error("Tags must be an array");
    }

    if (tags.length > 10) {
      throw new Error("Maximum 10 tags allowed");
    }

    file.tags = tags;
    await file.save();

    return file;
  }

  /**
   * Update file description
   */
  static async updateDescription(user, fileId, description) {
    const file = await File.findOne({
      _id: fileId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!file) {
      throw new Error("File not found");
    }

    file.description = description.trim();
    await file.save();

    return file;
  }

  /**
   * Get files by tags
   */
  static async getFilesByTags(user, tags, options = {}) {
    const { limit = 50, skip = 0 } = options;

    if (!Array.isArray(tags) || tags.length === 0) {
      throw new Error("Tags array required");
    }

    const files = await File.find({
      ownerId: user.id,
      isDeleted: false,
      tags: { $in: tags.map((t) => t.toLowerCase().trim()) },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Add URLs
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const downloadUrl = await storage.getDownloadUrl(file.s3Key, 3600);
        let previewUrl = null;

        if (
          file.hasPreview &&
          file.previewStatus === "ready" &&
          file.previewKey
        ) {
          previewUrl = await storage.getDownloadUrl(file.previewKey, 3600);
        }

        return {
          ...file,
          downloadUrl,
          previewUrl,
        };
      }),
    );

    return filesWithUrls;
  }

  /**
   * Search files by name, tags, or description
   */
  static async searchFiles(user, query, options = {}) {
    const { limit = 20, skip = 0 } = options;

    const files = await File.find({
      ownerId: user.id,
      isDeleted: false,
      $or: [
        { fileName: { $regex: query, $options: "i" } },
        { tags: { $in: [query.toLowerCase()] } },
        { description: { $regex: query, $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // Add URLs
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const downloadUrl = await storage.getDownloadUrl(file.s3Key, 3600);
        let previewUrl = null;

        if (
          file.hasPreview &&
          file.previewStatus === "ready" &&
          file.previewKey
        ) {
          previewUrl = await storage.getDownloadUrl(file.previewKey, 3600);
        }

        return {
          ...file,
          downloadUrl,
          previewUrl,
        };
      }),
    );

    return filesWithUrls;
  }

  /**
   * Get file statistics for user
   */
  static async getFileStats(userId) {
    const stats = await File.aggregate([
      {
        $match: {
          ownerId: userId,
          isDeleted: false,
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: "$size" },
          imageCount: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$mimeType", regex: /^image\// } },
                1,
                0,
              ],
            },
          },
          videoCount: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$mimeType", regex: /^video\// } },
                1,
                0,
              ],
            },
          },
          documentCount: {
            $sum: {
              $cond: [{ $eq: ["$mimeType", "application/pdf"] }, 1, 0],
            },
          },
          withPreviews: {
            $sum: { $cond: ["$hasPreview", 1, 0] },
          },
          processingPreviews: {
            $sum: { $cond: [{ $eq: ["$previewStatus", "processing"] }, 1, 0] },
          },
          failedPreviews: {
            $sum: { $cond: [{ $eq: ["$previewStatus", "failed"] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      stats[0] || {
        totalFiles: 0,
        totalSize: 0,
        imageCount: 0,
        videoCount: 0,
        documentCount: 0,
        withPreviews: 0,
        processingPreviews: 0,
        failedPreviews: 0,
      }
    );
  }

  /**
   * Helper: Check if file type supports preview generation
   */
  static isPreviewSupported(mimeType) {
    const supportedTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/tiff",
      "image/gif",
      "image/avif",
      // Videos
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
      "video/x-matroska",
      // PDFs
      "application/pdf",
    ];

    return supportedTypes.includes(mimeType);
  }

  /**
   * Helper: Generate preview key from s3Key
   */
  static generatePreviewKey(s3Key) {
    const basePath = s3Key.substring(0, s3Key.lastIndexOf("/"));
    return `${basePath}/preview.webp`;
  }
}
