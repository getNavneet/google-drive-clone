import express from "express";
import {
  getUploadUrl,
  confirmUpload,
  getBatchPreviews,
  previewWebhook,
  getFile,
  listFiles,
  deleteFile,
  batchDeleteFiles,
  moveFile,
  renameFile,
  updateTags,
  updateDescription,
  getFilesByTags,
  searchFiles,
  getFileStats,
} from "../controllers/file.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Health check
router.get("/status", (req, res) => {
  res.json({ status: "file service is running" });
});

// Upload flow
router.post("/upload-url", protect, getUploadUrl);
router.post("/confirm-upload", protect, confirmUpload);

// Preview management
router.post("/get-previews", protect, getBatchPreviews);
router.post("/preview-webhook", previewWebhook); // No auth - uses API key

// Search and filter 
// keep above Parameterized routes last (/:id, /:fileId, etc.)
router.get("/search", protect, searchFiles);
router.post("/by-tags", protect, getFilesByTags);
router.get("/stats", protect, getFileStats);

// File CRUD
router.get("/:fileId", protect, getFile);
router.get("/folder/:folderId", protect, listFiles);
router.delete("/:fileId", protect, deleteFile);
router.post("/batch-delete", protect, batchDeleteFiles);

// File operations
router.put("/:fileId/move", protect, moveFile);
router.put("/:fileId/rename", protect, renameFile);
router.put("/:fileId/tags", protect, updateTags);
router.put("/:fileId/description", protect, updateDescription);



export default router;