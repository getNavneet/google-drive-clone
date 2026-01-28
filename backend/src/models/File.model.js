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
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model("File", fileSchema);
