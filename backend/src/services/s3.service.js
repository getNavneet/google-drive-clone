import File from "../models/File.model.js";
import { S3Storage } from "../infra/s3.storage.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";

const storage = new S3Storage();

export class FileService {
  static async createUploadIntent(user, dto) {
    const filename = sanitizeFilename(dto.filename);
    //this key is for machine so user._id was good 
    const s3Key = `users/${user.id}/${Date.now()}_${filename}`;

    await File.create({
      ownerId: user.id,
      s3Key,
      name: dto.filename,
      mimeType: dto.mimeType,
      status: "pending",
    });

    const uploadUrl = await storage.getUploadUrl({
      key: s3Key,
      mimeType: dto.mimeType,
      metadata: {
        userId: user.id,
        username: user.username,
        email: user.email,
      },
    });

    return { uploadUrl, s3Key };
  }

  static async confirmUpload(user, s3Key, meta) {
    return File.create({
      ownerId: user.id,
      s3Key,
      ...meta,
      status: "active",
    });
  }
}
