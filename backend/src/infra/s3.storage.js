import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../config/awsS3.config.js";

export class S3Storage {
  async getUploadUrl({ key, mimeType, metadata = {} }) {
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key,
      ContentType: mimeType,
      Metadata: metadata,
    });

    return getSignedUrl(s3Client, command, { expiresIn: 300 });
  }

  async getDownloadUrl(key) {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn: 300 });
  }
}
