import File from "../models/File.model.js";
import User from "../models/User.model.js";
import { S3Storage } from "../infra/s3.storage.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";
import Folder from "../models/Folder.model.js";

const storage = new S3Storage();

export class FileService {
  static async createUploadIntent(user, dto) {
    //checking storage quota
    const dbUser = await User.findById(user.id).select(
      "storageUsed storageLimit",
    );

    if (!dbUser) {
      throw new Error("User not found");
    }
    if (dbUser.storageUsed + dto.size > dbUser.storageLimit) {
      throw new Error("Storage quota exceeded");
    }

    const folder = await Folder.findOne({
      _id: dto.parentFolderId || rootId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!folder) throw new Error("Invalid folder");

    const filename = sanitizeFilename(dto.filename);

    //this key is for machine so user._id was good
    const s3Key = `users/${user.id}/${dto.parentFolderId}/${Date.now()}_${filename}`;

    const file = await File.create({
      ownerId: user.id,
      parentFolderId: folder._id,
      s3Key,
      name: dto.filename, // original filename (for UI)
      mimeType: dto.mimeType,
      size: dto.size,
      status: "pending",
    });
    const uploadUrl = await storage.getUploadUrl({
      key: s3Key,
      mimeType: dto.mimeType,
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

  // flow ===> Frontend → upload → send fileId → confirm
  //here we confirm that the file was uploaded and update the db by cjecking the size of file uploaded
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

    // Validate ownership via metadata (extra safety)
    if (head.Metadata?.ownerid !== user.id.toString()) {
      throw new Error("Storage ownership mismatch");
    }

    // 3 Validate size
    const actualSize = head.ContentLength;

    if (actualSize <= 0) {
      throw new Error("Uploaded file is empty");
    }

    // OPTIONAL: max size enforcement
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (actualSize > MAX_SIZE) {
      throw new Error("File exceeds allowed size");
    }

    //  Validate mime (optional but recommended)
    if (file.mimeType && head.ContentType !== file.mimeType) {
      throw new Error("MIME type mismatch");
    }

    // Update DB with trusted values
    file.size = actualSize;
    file.mimeType = head.ContentType;
    file.status = "active";

    await file.save();

    return file;
  }

  static async getBatchPreviews(userId, fileIds) {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new Error("fileIds required");
    }

    const files = await File.find({
      _id: { $in: fileIds },
      ownerId: userId,
      status: "active",
      isDeleted: false,
      previewKey: { $exists: true, $ne: null },
    }).select("_id previewKey");

    const previews = {};

    await Promise.all(
      files.map(async (file) => {
        previews[file._id] = await storage.getDownloadUrl(file.previewKey);
      }),
    );

    return previews;
  }
}
