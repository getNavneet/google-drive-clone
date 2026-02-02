import { FolderService } from "../services/folder.service.js";

/**
 * Ensure root folder exists for user
 * POST /folders/ensure-root
 */
export const ensureRootFolder = async (req, res) => {
  try {
    const folder = await FolderService.ensureRootFolder(req.user.id);
    
    res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error ensuring root folder:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to ensure root folder",
    });
  }
};

/**
 * Create new folder
 * POST /folders/create
 * Body: { name: string, parentFolderId: string }
 */
export const createNewFolder = async (req, res) => {
  try {
    const { name, parentFolderId } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Folder name is required",
      });
    }

    if (!parentFolderId) {
      return res.status(400).json({
        success: false,
        error: "Parent folder ID is required",
      });
    }

    const folder = await FolderService.createNewFolder(req.user, {
      name,
      parentFolderId,
    });

    res.status(201).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    
    // Handle validation errors with 400
    if (
      error.message.includes("already exists") ||
      error.message.includes("invalid") ||
      error.message.includes("exceeds") ||
      error.message.includes("reserved") ||
      error.message.includes("cannot contain")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Handle not found errors with 404
    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to create folder",
    });
  }
};

/**
 * Get folder by ID
 * GET /folders/:folderId
 */
export const getFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await FolderService.getFolder(req.user, folderId);

    res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error getting folder:", error);
    
    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to get folder",
    });
  }
};

/**
 * List folders in parent folder
 * GET /folders/:folderId/list
 * Query: { limit?, skip?, sortBy?, sortOrder? }
 */
export const listFolders = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { limit, skip, sortBy, sortOrder } = req.query;

    const options = {
      limit: limit ? parseInt(limit) : 100,
      skip: skip ? parseInt(skip) : 0,
      sortBy: sortBy || "name",
      sortOrder: sortOrder || "asc",
    };

    const folders = await FolderService.listFolders(req.user, folderId, options);

    res.status(200).json({
      success: true,
      data: folders,
      count: folders.length,
    });
  } catch (error) {
    console.error("Error listing folders:", error);
    
    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to list folders",
    });
  }
};

/**
 * Get folder path (breadcrumb)
 * GET /folders/:folderId/path
 */
export const getFolderPath = async (req, res) => {
  try {
    const { folderId } = req.params;

    const path = await FolderService.getFolderPath(req.user, folderId);

    res.status(200).json({
      success: true,
      data: path,
    });
  } catch (error) {
    console.error("Error getting folder path:", error);
    
    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to get folder path",
    });
  }
};

/**
 * Rename folder
 * PUT /folders/:folderId/rename
 * Body: { newName: string }
 */
export const renameFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({
        success: false,
        error: "New folder name is required",
      });
    }

    const folder = await FolderService.renameFolder(req.user, folderId, newName);

    res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error renaming folder:", error);
    
    if (
      error.message.includes("already exists") ||
      error.message.includes("invalid") ||
      error.message.includes("exceeds") ||
      error.message.includes("Cannot rename")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to rename folder",
    });
  }
};

/**
 * Move folder to different parent
 * PUT /folders/:folderId/move
 * Body: { newParentFolderId: string }
 */
export const moveFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { newParentFolderId } = req.body;

    if (!newParentFolderId) {
      return res.status(400).json({
        success: false,
        error: "New parent folder ID is required",
      });
    }

    const folder = await FolderService.moveFolder(req.user, folderId, newParentFolderId);

    res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error moving folder:", error);
    
    if (
      error.message.includes("already exists") ||
      error.message.includes("Cannot move") ||
      error.message.includes("exceed")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to move folder",
    });
  }
};

/**
 * Delete folder (soft delete)
 * DELETE /folders/:folderId
 * Query: { cascade?: boolean, force?: boolean }
 */
export const deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { cascade, force } = req.query;

    const options = {
      cascade: cascade === "true",
      force: force === "true",
    };

    const result = await FolderService.deleteFolder(req.user, folderId, options);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error deleting folder:", error);
    
    if (
      error.message.includes("Cannot delete") ||
      error.message.includes("contains files")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete folder",
    });
  }
};

/**
 * Get folder statistics
 * GET /folders/:folderId/stats
 */
export const getFolderStats = async (req, res) => {
  try {
    const { folderId } = req.params;

    const stats = await FolderService.getFolderStats(req.user, folderId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting folder stats:", error);
    
    if (error.message.includes("not found") || error.message.includes("access denied")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to get folder stats",
    });
  }
};

/**
 * Search folders by name
 * GET /folders/search
 * Query: { q: string, limit?, skip? }
 */
export const searchFolders = async (req, res) => {
  try {
    const { q, limit, skip } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: "Search query (q) is required",
      });
    }

    const options = {
      limit: limit ? parseInt(limit) : 50,
      skip: skip ? parseInt(skip) : 0,
    };

    const folders = await FolderService.searchFolders(req.user, q, options);

    res.status(200).json({
      success: true,
      data: folders,
      count: folders.length,
    });
  } catch (error) {
    console.error("Error searching folders:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search folders",
    });
  }
};

/**
 * Restore deleted folder
 * POST /folders/:folderId/restore
 */
export const restoreFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await FolderService.restoreFolder(req.user, folderId);

    res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("Error restoring folder:", error);
    
    if (
      error.message.includes("Cannot restore") ||
      error.message.includes("already exists")
    ) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to restore folder",
    });
  }
};