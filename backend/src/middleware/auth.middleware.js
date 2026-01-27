import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';
 
export const generateToken = (userId, email) => {
  return jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};
// verifies auth_token JWT, loads user, and attaches it to req for protected routes
export const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Attach to request (stringify _id to avoid ObjectId issues in some JSON serializers)
    req.user = {
      id: user._id.toString(),
      email: user.email,
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
};