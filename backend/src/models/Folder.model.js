import mongoose from "mongoose";

const folderSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [255, "Folder name cannot exceed 255 characters"],
      validate: {
        validator: function (v) {
          // Prevent empty names after trimming
          if (!v || v.length === 0) return false;
          
          // Prevent forbidden characters
          const forbiddenChars = /[<>:"|?*\x00-\x1F\/\\]/;
          if (forbiddenChars.test(v)) return false;
          
          // Prevent path traversal
          if (v.includes("..") || v.includes("./") || v.includes(".\\")) return false;
          
          // Prevent leading/trailing dots
          if (v.startsWith(".") || v.endsWith(".")) return false;
          
          // Prevent reserved names (Windows)
          const reserved = ["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"];
          if (reserved.includes(v.toLowerCase())) return false;
          
          return true;
        },
        message: "Invalid folder name",
      },
    },

    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
      index: true,
    },

    path: {
      type: String,
      required: true,
      maxlength: [1024, "Folder path cannot exceed 1024 characters"],
      index: true,
    },

    depth: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Folder depth cannot be negative"],
      max: [20, "Maximum folder depth (20) exceeded"],
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    // Optional: track total size of files in folder (can be updated async)
    totalSize: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Optional: count of direct children (files + folders)
    fileCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    folderCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { 
    timestamps: true,
    // Optimize queries by excluding deleted folders by default
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for uniqueness: same name cannot exist in same parent for same owner
// Only enforce for non-deleted folders
folderSchema.index(
  { 
    parentFolderId: 1, 
    ownerId: 1, 
    name: 1,
    isDeleted: 1,
  },
  { 
    unique: true,
    // Only enforce uniqueness for non-deleted folders
    partialFilterExpression: { isDeleted: false },
    name: "unique_folder_name_per_parent",
  }
);

// Index for efficient querying of user's folders
folderSchema.index(
  { ownerId: 1, isDeleted: 1, createdAt: -1 },
  { name: "owner_active_folders" }
);

// Index for path-based queries (e.g., finding all subfolders)
folderSchema.index(
  { ownerId: 1, path: 1, isDeleted: 1 },
  { name: "owner_path_lookup" }
);

// Compound index for listing folder contents
folderSchema.index(
  { parentFolderId: 1, ownerId: 1, isDeleted: 1 },
  { name: "folder_contents" }
);

// Pre-save hook: ensure path is set correctly
folderSchema.pre("save", async function () {
  // Only validate path if it's being modified
  if (this.isModified("path")) {
    // Root folder validation
    if (this.path === "/" && this.parentFolderId !== null) {
      return next(new Error("Root folder cannot have a parent"));
    }

    // Non-root folder validation
    if (this.path !== "/" && this.parentFolderId === null) {
      return next(new Error("Non-root folder must have a parent"));
    }
  }

});

// Virtual: check if this is root folder
folderSchema.virtual("isRoot").get(function () {
  return this.path === "/";
});

// Virtual: get folder basename (last part of path)
folderSchema.virtual("basename").get(function () {
  if (this.path === "/") return "/";
  const parts = this.path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "/";
});

// Static method: find root folder for user
folderSchema.statics.findRootFolder = function (ownerId) {
  return this.findOne({
    ownerId,
    path: "/",
    isDeleted: false,
  });
};

// Static method: find folder by path for user
folderSchema.statics.findByPath = function (ownerId, path) {
  return this.findOne({
    ownerId,
    path,
    isDeleted: false,
  });
};

// Instance method: get all ancestor folders
folderSchema.methods.getAncestors = async function () {
  if (this.path === "/") return [];

  const pathParts = this.path.split("/").filter(Boolean);
  const ancestorPaths = [];
  
  let currentPath = "";
  for (let i = 0; i < pathParts.length - 1; i++) {
    currentPath += "/" + pathParts[i];
    ancestorPaths.push(currentPath);
  }

  if (ancestorPaths.length === 0) {
    ancestorPaths.push("/");
  }

  return this.constructor.find({
    ownerId: this.ownerId,
    path: { $in: ancestorPaths },
    isDeleted: false,
  }).sort({ depth: 1 });
};

// Instance method: get all descendants (subfolders at any depth)
folderSchema.methods.getDescendants = async function () {
  const pathPattern = this.path === "/" 
    ? /^\/[^/]/ // Match anything starting with / followed by non-slash
    : new RegExp(`^${this.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`);

  return this.constructor.find({
    ownerId: this.ownerId,
    path: pathPattern,
    isDeleted: false,
  }).sort({ depth: 1 });
};

// Instance method: get immediate children folders
folderSchema.methods.getChildren = async function () {
  return this.constructor.find({
    parentFolderId: this._id,
    ownerId: this.ownerId,
    isDeleted: false,
  }).sort({ name: 1 });
};

// Instance method: soft delete folder and all descendants
folderSchema.methods.softDeleteWithDescendants = async function () {
  const now = new Date();
  
  // Get all descendants
  const descendants = await this.getDescendants();
  const folderIds = [this._id, ...descendants.map(d => d._id)];

  // Soft delete all folders in the tree
  await this.constructor.updateMany(
    { _id: { $in: folderIds } },
    { 
      $set: { 
        isDeleted: true, 
        deletedAt: now 
      } 
    }
  );

  // Also need to soft delete all files in these folders
  // This should be done in the service layer to properly handle storage quota
  return folderIds;
};

// Instance method: check if folder can be deleted (no active files)
folderSchema.methods.canBeDeleted = async function () {
  const File = mongoose.model("File");
  
  // Check if this folder or any descendant has active files
  const descendants = await this.getDescendants();
  const folderIds = [this._id, ...descendants.map(d => d._id)];

  const fileCount = await File.countDocuments({
    parentFolderId: { $in: folderIds },
    isDeleted: false,
  });

  return fileCount === 0;
};

export default mongoose.model("Folder", folderSchema);