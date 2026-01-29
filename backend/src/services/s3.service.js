import File from "../models/File.model.js";
import { S3Storage } from "../infra/s3.storage.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";

const storage = new S3Storage();

export class FileService {
  static async createUploadIntent(user, dto) {
    const filename = sanitizeFilename(dto.filename);
    //this key is for machine so user._id was good 
    const s3Key = `users/${user.id}/${Date.now()}_${filename}`;

  const file = await File.create({
    ownerId: user.id,
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

static async confirmUpload(user, fileId) {
  const file = await File.findOne({
    _id: fileId,
    ownerId: user.id,
    status: "pending",
  });

  if (!file) {
    throw new Error("Invalid or already confirmed upload");
  }

  // OPTIONAL (recommended later):
  // const head = await storage.headObject(file.s3Key);
  // validate size & mime here

  file.status = "active";
  await file.save();

  return file;
}

}
