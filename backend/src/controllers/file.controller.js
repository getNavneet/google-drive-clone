import { FileService } from "../services/s3.service.js";

export const getUploadUrl = async (req, res) => {
  const data = await FileService.createUploadIntent(req.user, req.body);
  res.json(data);
};

export const confirmUpload = async (req, res) => {
  const file = await FileService.confirmUpload(
    req.user,
    req.body.s3Key,
    req.body
  );

  res.status(201).json(file);
};
