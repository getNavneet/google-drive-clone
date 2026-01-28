import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
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
    },

    size: {
      type: Number, // bytes
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "failed"],
      default: "pending",
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
    },

    s3Key: {
      type: String,
      required: true,
      unique: true,
    },

    parentFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default mongoose.model("File", fileSchema);
