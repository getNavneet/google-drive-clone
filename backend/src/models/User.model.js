import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    storageUsed: {
      type: Number,
      default: 0,
    },
    storageLimit: {
      type: Number,
      default: 100 * 1024 * 1024, // 100 MiB
    },
  },
  { timestamps: true }
);

// Hash password before save (only if modified)
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();

  try {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export default mongoose.model('User', userSchema);