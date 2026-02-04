import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    fileName: {
      type: String,
      required: true,
    },

    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      required: true,
      index: true,
    },

    size: {
      type: Number, // bytes
      required: true,
      min: 0,
    },

    mimeType: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "failed"],
      default: "pending",
       index: true,
    },

    tags: {
      type: [String],
      default: [],
      index: true,
      set: (tags) => tags.map((t) => t.trim().toLowerCase()),
      validate: {
        validator: (tags) => tags.length <= 10,
        message: "A file can have at most 10 tags",
      },
    },

    description: {
      type: String,
      trim: true,
      default: "",
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

    s3Key: {
      type: String,
      unique: true,
    },
    hasPreview: {
      type: Boolean,
      default: false,
      index: true,
    },

    previewKey: {
      type: String,
      default: null,
    },

    previewStatus: {
      type: String,
      enum: ["none", "processing", "ready", "failed"],
      default: "none",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Compound indexes for common queries
fileSchema.index({ ownerId: 1, parentFolderId: 1, isDeleted: 1 });
fileSchema.index({ ownerId: 1, status: 1, isDeleted: 1 });
fileSchema.index({ ownerId: 1, hasPreview: 1 });
fileSchema.index({ fileName: "text" }); // Text search index

// Virtual for checking if file is an image
fileSchema.virtual("isImage").get(function () {
  return this.mimeType && this.mimeType.startsWith("image/");
});

// Virtual for checking if file is a video
fileSchema.virtual("isVideo").get(function () {
  return this.mimeType && this.mimeType.startsWith("video/");
});

// Virtual for checking if file is a PDF
fileSchema.virtual("isPDF").get(function () {
  return this.mimeType === "application/pdf";
});

// Virtual for file type category
fileSchema.virtual("fileType").get(function () {
  if (!this.mimeType) return "unknown";

  if (this.mimeType.startsWith("image/")) return "image";
  if (this.mimeType.startsWith("video/")) return "video";
  if (this.mimeType.startsWith("audio/")) return "audio";
  if (this.mimeType === "application/pdf") return "pdf";
  if (this.mimeType.includes("word") || this.mimeType.includes("document")) {
    return "document";
  }
  if (this.mimeType.includes("sheet") || this.mimeType.includes("excel")) {
    return "spreadsheet";
  }
  if (
    this.mimeType.includes("presentation") ||
    this.mimeType.includes("powerpoint")
  ) {
    return "presentation";
  }
  if (this.mimeType.startsWith("text/")) return "text";

  return "other";
});

// Method to check if preview is available
fileSchema.methods.previewAvailable = function () {
  return this.hasPreview && this.previewKey;
};

// Method to get human-readable file size
fileSchema.methods.getReadableSize = function () {
  const bytes = this.size;
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Static method to get files by type
fileSchema.statics.findByType = async function (
  ownerId,
  fileType,
  options = {},
) {
  let mimeTypePattern;

  switch (fileType) {
    case "image":
      mimeTypePattern = /^image\//;
      break;
    case "video":
      mimeTypePattern = /^video\//;
      break;
    case "audio":
      mimeTypePattern = /^audio\//;
      break;
    case "pdf":
      return this.find({
        ownerId,
        mimeType: "application/pdf",
        isDeleted: false,
        ...options,
      });
    default:
      return [];
  }

  return this.find({
    ownerId,
    mimeType: { $regex: mimeTypePattern },
    isDeleted: false,
    ...options,
  });
};

fileSchema.pre("save", async function () {
  if (this.isDeleted && !this.deletedAt) {
    this.deletedAt = new Date();
  }
});
// Configure toJSON to include virtuals
fileSchema.set("toJSON", { virtuals: true });
fileSchema.set("toObject", { virtuals: true });

export default mongoose.model("File", fileSchema);
