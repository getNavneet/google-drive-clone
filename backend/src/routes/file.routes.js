import express from "express";
import { getUploadUrl, confirmUpload, getBatchPreviews } from "../controllers/file.controller.js";
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'file service is running' });
});
router.post("/upload-url", protect, getUploadUrl);
router.post("/confirm-upload", protect, confirmUpload);
router.post("/get-previews", protect, getBatchPreviews);

export default router;
