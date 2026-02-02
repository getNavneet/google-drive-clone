import express from "express";
import {
  createNewFolder,
  getFolder,
  listFolders,
  getFolderPath,
  renameFolder,
  moveFolder,
  deleteFolder,
  getFolderStats,
  searchFolders,
  restoreFolder,
  ensureRootFolder,
} from "../controllers/folder.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Health check
router.get("/status", (req, res) => {
  res.json({ status: "folder service is running" });
});

// Root folder management
router.post("/ensure-root", protect, ensureRootFolder);

// Folder CRUD
router.post("/create", protect, createNewFolder);
router.get("/:folderId", protect, getFolder);
router.get("/:folderId/list", protect, listFolders); // List subfolders
router.delete("/:folderId", protect, deleteFolder);

// Folder operations
router.put("/:folderId/rename", protect, renameFolder);
router.put("/:folderId/move", protect, moveFolder);
router.post("/:folderId/restore", protect, restoreFolder);

// Folder navigation & info
router.get("/:folderId/path", protect, getFolderPath); // Get breadcrumb path
router.get("/:folderId/stats", protect, getFolderStats); // Get folder statistics

// Search
router.get("/search", protect, searchFolders);

export default router;