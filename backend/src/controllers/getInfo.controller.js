import User from "../models/User.model.js";

export const getAvailableStorage = async (req, res) => {
  const userId = req.user.id;

  const user = await User.findById(userId).select(
    "storageUsed storageLimit"
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const used = user.storageUsed || 0;
  const total = user.storageLimit;

  res.json({
    used,
    total,
    remaining: Math.max(total - used, 0),
    percentageUsed: total
      ? Math.round((used / total) * 100)
      : 0,
  });
};
