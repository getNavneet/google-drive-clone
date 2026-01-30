import express from "express";
import { createNewFolder } from "../controllers/folder.controller.js";
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'folder service is running' });
});
router.post("/create-new-folder", protect, createNewFolder);

export default router;
