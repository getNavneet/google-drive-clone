import { FileService } from "../services/file.service.js";

export const getUploadUrl = async (req, res) => {
  const data = await FileService.createUploadIntent(req.user, req.body);
  res.json(data);
};

export const confirmUpload = async (req, res) => {
  const file = await FileService.confirmUpload(req.user, req.body.fileId);
  res.status(201).json(file);
};

export const getBatchPreviews = async (req, res) => {
  try {
    const previews = await FileService.getBatchPreviews(
      req.user.id,
      req.body.fileIds,
    );

    res.json({ previews });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
