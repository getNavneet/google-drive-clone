import { FileService } from "../services/file.service.js";

/**
 * Get presigned upload URL
 * POST /files/upload-url
 * Body: { filename, mimeType, size, parentFolderId, tags?, description? }
 */
export const getUploadUrl = async (req, res) => {
  try {
    const { filename, mimeType, size, parentFolderId, tags, description } = req.body;

    // Validate required fields
    if (!filename || !mimeType || !size || !parentFolderId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: filename, mimeType, size, parentFolderId",
      });
    }

    const data = await FileService.createUploadIntent(req.user, req.body);
    
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error creating upload intent:", error);
    
    if (
      error.message.includes("quota exceeded") ||
      error.message.includes("Invalid folder") ||
      error.message.includes("User not found")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to create upload intent",
    });
  }
};

/**
 * Confirm upload after client completes S3 upload
 * POST /files/confirm-upload
 * Body: { fileId }
 */
export const confirmUpload = async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: "File ID is required",
      });
    }

    const file = await FileService.confirmUpload(req.user, fileId);
    
    res.status(201).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error confirming upload:", error);
    
    if (
      error.message.includes("Invalid or already confirmed") ||
      error.message.includes("not found") ||
      error.message.includes("ownership mismatch") ||
      error.message.includes("MIME type mismatch") ||
      error.message.includes("exceeds allowed size") ||
      error.message.includes("empty")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to confirm upload",
    });
  }
};

/**
 * Get batch preview URLs for multiple files
 * POST /files/get-previews
 * Body: { fileIds: string[] }
 */
export const getBatchPreviews = async (req, res) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "fileIds array is required",
      });
    }

    const previews = await FileService.getBatchPreviews(req.user.id, fileIds);

    res.status(200).json({
      success: true,
      data: previews,
    });
  } catch (error) {
    console.error("Error getting batch previews:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get previews",
    });
  }
};

/**
 * Webhook for preview generation completion
 * POST /files/preview-webhook
 * Body: { fileId, previewKey, status, error? }
 * Note: This endpoint should be authenticated via API key or webhook signature
 */
export const previewWebhook = async (req, res) => {
  try {
    const { fileId, previewKey, status, error } = req.body;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: "File ID is required",
      });
    }

    if (status === "failed" || error) {
      await FileService.markPreviewFailed(fileId, error || "Unknown error");
    } else if (status === "ready" && previewKey) {
      await FileService.updatePreview(fileId, previewKey, status);
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid webhook payload",
      });
    }

    res.status(200).json({
      success: true,
      message: "Preview status updated",
    });
  } catch (error) {
    console.error("Error processing preview webhook:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process webhook",
    });
  }
};

/**
 * Get single file with download and preview URLs
 * GET /files/:fileId
 */
export const getFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await FileService.getFile(req.user, fileId);

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error getting file:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to get file",
    });
  }
};

/**
 * List files in a folder
 * GET /files/folder/:folderId
 * Query: { limit?, skip?, includeUrls? }
 */
export const listFiles = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { limit, skip, includeUrls } = req.query;

    const options = {
      limit: limit ? parseInt(limit) : 50,
      skip: skip ? parseInt(skip) : 0,
      includeUrls: includeUrls !== "false", // true by default
    };

    const files = await FileService.listFiles(req.user, folderId, options);

    res.status(200).json({
      success: true,
      data: files,
      count: files.length,
    });
  } catch (error) {
    console.error("Error listing files:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to list files",
    });
  }
};

/**
 * Delete file (soft delete)
 * DELETE /files/:fileId
 */
export const deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const result = await FileService.deleteFile(req.user, fileId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("storage quota")) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete file",
    });
  }
};

/**
 * Batch delete files
 * POST /files/batch-delete
 * Body: { fileIds: string[] }
 */
export const batchDeleteFiles = async (req, res) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "fileIds array is required",
      });
    }

    const result = await FileService.batchDeleteFiles(req.user, fileIds);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error batch deleting files:", error);
    
    if (error.message.includes("No valid files found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to batch delete files",
    });
  }
};

/**
 * Move file to different folder
 * PUT /files/:fileId/move
 * Body: { newFolderId }
 */
export const moveFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { newFolderId } = req.body;

    if (!newFolderId) {
      return res.status(400).json({
        success: false,
        error: "New folder ID is required",
      });
    }

    const file = await FileService.moveFile(req.user, fileId, newFolderId);

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error moving file:", error);
    
    if (
      error.message.includes("not found") ||
      error.message.includes("Invalid destination folder")
    ) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to move file",
    });
  }
};

/**
 * Rename file
 * PUT /files/:fileId/rename
 * Body: { newFileName }
 */
export const renameFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { newFileName } = req.body;

    if (!newFileName || !newFileName.trim()) {
      return res.status(400).json({
        success: false,
        error: "New file name is required",
      });
    }

    const file = await FileService.renameFile(req.user, fileId, newFileName);

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error renaming file:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to rename file",
    });
  }
};

/**
 * Update file tags
 * PUT /files/:fileId/tags
 * Body: { tags: string[] }
 */
export const updateTags = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: "Tags must be an array",
      });
    }

    const file = await FileService.updateTags(req.user, fileId, tags);

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error updating tags:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("Maximum 10 tags")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to update tags",
    });
  }
};

/**
 * Update file description
 * PUT /files/:fileId/description
 * Body: { description }
 */
export const updateDescription = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { description } = req.body;

    if (description === undefined || description === null) {
      return res.status(400).json({
        success: false,
        error: "Description is required",
      });
    }

    const file = await FileService.updateDescription(req.user, fileId, description);

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    console.error("Error updating description:", error);
    
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to update description",
    });
  }
};

/**
 * Get files by tags
 * POST /files/by-tags
 * Body: { tags: string[], limit?, skip? }
 */
export const getFilesByTags = async (req, res) => {
  try {
    const { tags, limit, skip } = req.body;

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Tags array is required",
      });
    }

    const options = {
      limit: limit ? parseInt(limit) : 50,
      skip: skip ? parseInt(skip) : 0,
    };

    const files = await FileService.getFilesByTags(req.user, tags, options);

    res.status(200).json({
      success: true,
      data: files,
      count: files.length,
    });
  } catch (error) {
    console.error("Error getting files by tags:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get files by tags",
    });
  }
};

/**
 * Search files by name, tags, or description
 * GET /files/search
 * Query: { q, limit?, skip? }
 */
export const searchFiles = async (req, res) => {
  try {
    const { q, limit, skip } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        error: "Search query (q) is required",
      });
    }

    const options = {
      limit: limit ? parseInt(limit) : 20,
      skip: skip ? parseInt(skip) : 0,
    };

    const files = await FileService.searchFiles(req.user, q, options);

    res.status(200).json({
      success: true,
      data: files,
      count: files.length,
    });
  } catch (error) {
    console.error("Error searching files:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search files",
    });
  }
};

/**
 * Get file statistics for user
 * GET /files/stats
 */
export const getFileStats = async (req, res) => {
  try {
    const stats = await FileService.getFileStats(req.user.id);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting file stats:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get file statistics",
    });
  }
};