import express from "express";
import { getUploadUrl, confirmUpload } from "../controllers/file.controller.js";
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post("/upload-url", protect, getUploadUrl);
router.post("/confirm-upload", protect, confirmUpload);

export default router;
