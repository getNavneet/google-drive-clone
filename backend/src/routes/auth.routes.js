import express from 'express';
import { registerUser, loginUser, logoutUser, getCurrentUser, deleteUserAccount } from '../controllers/auth.controller.js'
import { protect } from '../middleware/auth.middleware.js';
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'Authentication service is running' });
});
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/me', protect, getCurrentUser);
router.post('/delete-account', protect, deleteUserAccount);





export default router;