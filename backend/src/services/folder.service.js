import Folder from "../models/Folder.model.js";
import File from "../models/File.model.js";
import User from "../models/User.model.js";

export class FolderService {
  // Configuration constants
  static MAX_FOLDER_NAME_LENGTH = 255;
  static MAX_FOLDER_DEPTH = 20;
  static RESERVED_NAMES = [
    "con", "prn", "aux", "nul", 
    "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
    "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
  ];
  static FORBIDDEN_CHARS = /[<>:"|?*\x00-\x1F\/\\]/g;

  /**
   * Validate and sanitize folder name
   */
  static validateFolderName(name) {
    if (!name || typeof name !== "string") {
      throw new Error("Folder name is required");
    }

    // Trim whitespace
    const trimmed = name.trim();

    if (trimmed.length === 0) {
      throw new Error("Folder name cannot be empty");
    }

    if (trimmed.length > this.MAX_FOLDER_NAME_LENGTH) {
      throw new Error(`Folder name exceeds ${this.MAX_FOLDER_NAME_LENGTH} characters`);
    }

    // Check for forbidden characters
    if (this.FORBIDDEN_CHARS.test(trimmed)) {
      throw new Error("Folder name contains invalid characters (< > : \" | ? * / \\)");
    }

    // Check for path traversal attempts
    if (trimmed.includes("..")) {
      throw new Error("Folder name cannot contain '..'");
    }

    // Check reserved names (case-insensitive)
    if (this.RESERVED_NAMES.includes(trimmed.toLowerCase())) {
      throw new Error("Folder name is reserved by the system");
    }

    // Check for leading/trailing dots
    if (trimmed.startsWith(".") || trimmed.endsWith(".")) {
      throw new Error("Folder name cannot start or end with a dot");
    }

    return trimmed;
  }

  /**
   * Calculate folder depth from path
   */
  static getFolderDepth(path) {
    if (path === "/") return 0;
    return path.split("/").filter(Boolean).length;
  }

  /**
   * Get or create root folder for user
   */
 static async ensureRootFolder(userId) {
    let home = await Folder.findOne({
      ownerId: userId,
      path: '/',
      isDeleted: false,
    });

    if (!home) {
      home = await Folder.create({
        ownerId: userId,
        name: 'Home',
        parentFolderId: null,
        path: '/',
        depth: 0,
        isDeleted: false,
      });
    }

    return home;
  }

  /**
   * Create new folder with comprehensive validation
   */
  static async createNewFolder(user, dto) {
    // Validate input
    if (!dto || !dto.name) {
      throw new Error("Folder name is required");
    }

    // Validate and sanitize folder name
    const sanitizedName = this.validateFolderName(dto.name);

    // Handle root folder creation or get parent
    let parent;
    let newPath;
    let depth;

    if (!dto.parentFolderId) {
      // Creating root folder or error
      throw new Error("Parent folder ID is required. Use ensureRootFolder() for root creation.");
    }

    // Find and validate parent folder with ownership check
    parent = await Folder.findOne({
      _id: dto.parentFolderId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!parent) {
      throw new Error("Parent folder not found or access denied");
    }

    // Check depth limit
    if (parent.depth >= this.MAX_FOLDER_DEPTH) {
      throw new Error(`Maximum folder depth (${this.MAX_FOLDER_DEPTH}) exceeded`);
    }

    // Build path and depth
    newPath = parent.path === "/" 
      ? `/${sanitizedName}` 
      : `${parent.path}/${sanitizedName}`;
    depth = parent.depth + 1;

    // Validate path length
    if (newPath.length > 1024) {
      throw new Error("Folder path exceeds maximum length (1024 characters)");
    }

    // Check for duplicate name in same parent (case-insensitive for better UX)
    const existing = await Folder.findOne({
      parentFolderId: parent._id,
      name: { $regex: new RegExp(`^${this.escapeRegex(sanitizedName)}$`, "i") },
      isDeleted: false,
    });

    if (existing) {
      throw new Error("A folder with this name already exists in this location");
    }

    // Create folder
    try {
      const folder = await Folder.create({
        ownerId: user.id,
        name: sanitizedName,
        parentFolderId: parent._id,
        path: newPath,
        depth,
        isDeleted: false,
      });

      // Update parent's folder count
      await Folder.findByIdAndUpdate(parent._id, {
        $inc: { folderCount: 1 },
      });

      return folder;
    } catch (error) {
      // Handle duplicate key errors from unique indexes
      if (error.code === 11000) {
        throw new Error("A folder with this name already exists in this location");
      }
      throw error;
    }
  }

  /**
   * Get folder by ID with ownership validation
   */
  static async getFolder(user, folderId) {
    const folder = await Folder.findOne({
      _id: folderId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!folder) {
      throw new Error("Folder not found or access denied");
    }

    return folder;
  }

  /**
   * List folders in a parent folder
   */
  static async listFolders(user, parentFolderId, options = {}) {
    const { limit = 100, skip = 0, sortBy = "name", sortOrder = "asc" } = options;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const folders = await Folder.find({
      ownerId: user.id,
      parentFolderId,
      isDeleted: false,
    })
      .sort(sortOptions)
      .limit(limit)
      .skip(skip)
      .lean();

    return folders;
  }

  /**
   * Get folder tree (breadcrumb path)
   */
  static async getFolderPath(user, folderId) {
    const folder = await this.getFolder(user, folderId);
    const ancestors = await folder.getAncestors();
    
    return [...ancestors, folder];
  }

  /**
   * Rename folder
   */
  static async renameFolder(user, folderId, newName) {
    const folder = await this.getFolder(user, folderId);

    // Cannot rename root folder
    if (folder.path === "/") {
      throw new Error("Cannot rename root folder");
    }

    // Validate new name
    const sanitizedName = this.validateFolderName(newName);

    // Check if name is actually changing
    if (folder.name.toLowerCase() === sanitizedName.toLowerCase()) {
      return folder; // No change needed
    }

    // Check for duplicate
    const existing = await Folder.findOne({
      parentFolderId: folder.parentFolderId,
      name: { $regex: new RegExp(`^${this.escapeRegex(sanitizedName)}$`, "i") },
      isDeleted: false,
      _id: { $ne: folder._id },
    });

    if (existing) {
      throw new Error("A folder with this name already exists in this location");
    }

    // Build new path
    const parentPath = folder.path.substring(0, folder.path.lastIndexOf("/"));
    const newPath = parentPath === "" ? `/${sanitizedName}` : `${parentPath}/${sanitizedName}`;

    // Validate new path length
    if (newPath.length > 1024) {
      throw new Error("New folder path exceeds maximum length");
    }

    // Get all descendants to update their paths
    const descendants = await folder.getDescendants();

    // Update folder name and path
    const oldPath = folder.path;
    folder.name = sanitizedName;
    folder.path = newPath;
    await folder.save();

    // Update all descendant paths
    if (descendants.length > 0) {
      const bulkOps = descendants.map(desc => ({
        updateOne: {
          filter: { _id: desc._id },
          update: {
            $set: {
              path: desc.path.replace(oldPath, newPath),
            },
          },
        },
      }));

      await Folder.bulkWrite(bulkOps);
    }

    return folder;
  }

  /**
   * Move folder to a different parent
   */
  static async moveFolder(user, folderId, newParentFolderId) {
    const folder = await this.getFolder(user, folderId);

    // Cannot move root folder
    if (folder.path === "/") {
      throw new Error("Cannot move root folder");
    }

    // Validate new parent
    const newParent = await this.getFolder(user, newParentFolderId);

    // Cannot move folder into itself or its descendants
    if (newParent.path.startsWith(folder.path)) {
      throw new Error("Cannot move folder into itself or its descendants");
    }

    // Check depth limit
    const newDepth = newParent.depth + 1;
    const descendants = await folder.getDescendants();
    const maxDescendantDepth = descendants.length > 0 
      ? Math.max(...descendants.map(d => d.depth)) 
      : folder.depth;
    const depthIncrease = newDepth - folder.depth;

    if (maxDescendantDepth + depthIncrease > this.MAX_FOLDER_DEPTH) {
      throw new Error(`Moving this folder would exceed maximum depth (${this.MAX_FOLDER_DEPTH})`);
    }

    // Check for duplicate name in new location
    const existing = await Folder.findOne({
      parentFolderId: newParent._id,
      name: { $regex: new RegExp(`^${this.escapeRegex(folder.name)}$`, "i") },
      isDeleted: false,
      _id: { $ne: folder._id },
    });

    if (existing) {
      throw new Error("A folder with this name already exists in the destination");
    }

    // Build new path
    const newPath = newParent.path === "/" 
      ? `/${folder.name}` 
      : `${newParent.path}/${folder.name}`;

    if (newPath.length > 1024) {
      throw new Error("New folder path exceeds maximum length");
    }

    // Update old and new parent counts
    await Folder.findByIdAndUpdate(folder.parentFolderId, {
      $inc: { folderCount: -1 },
    });
    await Folder.findByIdAndUpdate(newParent._id, {
      $inc: { folderCount: 1 },
    });

    // Update folder
    const oldPath = folder.path;
    folder.parentFolderId = newParent._id;
    folder.path = newPath;
    folder.depth = newDepth;
    await folder.save();

    // Update all descendant paths and depths
    if (descendants.length > 0) {
      const bulkOps = descendants.map(desc => ({
        updateOne: {
          filter: { _id: desc._id },
          update: {
            $set: {
              path: desc.path.replace(oldPath, newPath),
              depth: desc.depth + depthIncrease,
            },
          },
        },
      }));

      await Folder.bulkWrite(bulkOps);
    }

    return folder;
  }

  /**
   * Soft delete folder (with optional cascade to files)
   */
  static async deleteFolder(user, folderId, options = {}) {
    const { cascade = false, force = false } = options;
    
    const folder = await this.getFolder(user, folderId);

    // Cannot delete root folder
    if (folder.path === "/") {
      throw new Error("Cannot delete root folder");
    }

    // Check if folder can be deleted (has no active files)
    if (!force) {
      const canDelete = await folder.canBeDeleted();
      if (!canDelete) {
        throw new Error("Folder contains files. Use force=true to delete anyway or move files first.");
      }
    }

    const now = new Date();
    let deletedFolderIds = [];
    let totalStorageReclaimed = 0;

    if (cascade) {
      // Get all descendants
      const descendants = await folder.getDescendants();
      deletedFolderIds = [folder._id, ...descendants.map(d => d._id)];

      // Soft delete all folders
      await Folder.updateMany(
        { _id: { $in: deletedFolderIds } },
        { 
          $set: { 
            isDeleted: true, 
            deletedAt: now 
          } 
        }
      );

      // Soft delete all files in these folders and calculate storage to reclaim
      const files = await File.find({
        parentFolderId: { $in: deletedFolderIds },
        isDeleted: false,
        status: "active",
      });

      if (files.length > 0) {
        const fileIds = files.map(f => f._id);
        totalStorageReclaimed = files.reduce((sum, f) => sum + f.size, 0);

        // Soft delete files
        await File.updateMany(
          { _id: { $in: fileIds } },
          { 
            $set: { 
              isDeleted: true, 
              deletedAt: now 
            } 
          }
        );

        // Update user storage quota atomically
        if (totalStorageReclaimed > 0) {
          await User.findOneAndUpdate(
            { 
              _id: user.id,
              storageUsed: { $gte: totalStorageReclaimed }
            },
            { $inc: { storageUsed: -totalStorageReclaimed } }
          );
        }
      }
    } else {
      // Just delete the single folder
      folder.isDeleted = true;
      folder.deletedAt = now;
      await folder.save();
      deletedFolderIds = [folder._id];
    }

    // Update parent's folder count
    if (folder.parentFolderId) {
      await Folder.findByIdAndUpdate(folder.parentFolderId, {
        $inc: { folderCount: -1 },
      });
    }

    return {
      success: true,
      deletedFolders: deletedFolderIds.length,
      storageReclaimed: totalStorageReclaimed,
    };
  }

  /**
   * Get folder statistics
   */
  static async getFolderStats(user, folderId) {
    const folder = await this.getFolder(user, folderId);

    // Count direct children
    const childFolders = await Folder.countDocuments({
      parentFolderId: folder._id,
      ownerId: user.id,
      isDeleted: false,
    });

    const childFiles = await File.countDocuments({
      parentFolderId: folder._id,
      ownerId: user.id,
      isDeleted: false,
    });

    // Calculate total size of files in this folder
    const sizeResult = await File.aggregate([
      {
        $match: {
          parentFolderId: folder._id,
          ownerId: user.id,
          isDeleted: false,
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          totalSize: { $sum: "$size" },
        },
      },
    ]);

    const totalSize = sizeResult.length > 0 ? sizeResult[0].totalSize : 0;

    return {
      folderId: folder._id,
      folderName: folder.name,
      path: folder.path,
      depth: folder.depth,
      childFolders,
      childFiles,
      totalSize,
    };
  }

  /**
   * Search folders by name
   */
  static async searchFolders(user, query, options = {}) {
    const { limit = 50, skip = 0 } = options;

    if (!query || query.trim().length === 0) {
      throw new Error("Search query is required");
    }

    const folders = await Folder.find({
      ownerId: user.id,
      isDeleted: false,
      name: { $regex: this.escapeRegex(query), $options: "i" },
    })
      .sort({ path: 1 })
      .limit(limit)
      .skip(skip)
      .lean();

    return folders;
  }

  /**
   * Helper: Escape special regex characters
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Restore soft-deleted folder
   */
  static async restoreFolder(user, folderId) {
    const folder = await Folder.findOne({
      _id: folderId,
      ownerId: user.id,
      isDeleted: true,
    });

    if (!folder) {
      throw new Error("Deleted folder not found");
    }

    // Check if parent still exists
    if (folder.parentFolderId) {
      const parent = await Folder.findOne({
        _id: folder.parentFolderId,
        ownerId: user.id,
        isDeleted: false,
      });

      if (!parent) {
        throw new Error("Cannot restore: parent folder no longer exists");
      }
    }

    // Check for name conflict
    const existing = await Folder.findOne({
      parentFolderId: folder.parentFolderId,
      name: { $regex: new RegExp(`^${this.escapeRegex(folder.name)}$`, "i") },
      isDeleted: false,
    });

    if (existing) {
      throw new Error("Cannot restore: a folder with this name already exists in this location");
    }

    // Restore
    folder.isDeleted = false;
    folder.deletedAt = null;
    await folder.save();

    return folder;
  }
}