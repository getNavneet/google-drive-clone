import express from "express";
import { getAvailableStorage } from "../controllers/getInfo.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/status", (req, res) => {
  res.json({ status: "Info route is running" });
});

router.get("/available-storage", protect, getAvailableStorage);

export default router;
