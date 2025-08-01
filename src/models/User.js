import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String,
    default: ''
  },
  refreshToken: {
    type: String,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better query performance
userSchema.index({ createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      role: this.role 
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpire }
  );
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    config.jwtSecret + 'refresh',
    { expiresIn: '30d' }
  );
};

// Update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save({ validateBeforeSave: false });
};

// Virtual for user's full profile
userSchema.virtual('profile').get(function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isVerified: this.isVerified,
    avatar: this.avatar,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
});

// Static method to get users with session counts
userSchema.statics.getUsersWithSessionCount = function(options = {}) {
  const { limit = 50, skip = 0, sortBy = 'createdAt', sortOrder = -1 } = options;
  
  return this.aggregate([
    {
      $lookup: {
        from: 'sessions',
        localField: '_id',
        foreignField: 'userId',
        as: 'sessions'
      }
    },
    {
      $addFields: {
        sessionCount: { $size: '$sessions' },
        activeSessions: {
          $size: {
            $filter: {
              input: '$sessions',
              cond: { $eq: ['$$this.status', 'active'] }
            }
          }
        },
        completedSessions: {
          $size: {
            $filter: {
              input: '$sessions',
              cond: { $eq: ['$$this.status', 'completed'] }
            }
          }
        },
        lastSessionDate: {
          $max: '$sessions.startTime'
        },
        totalSamples: {
          $sum: '$sessions.totalSamples'
        }
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        isVerified: 1,
        avatar: 1,
        lastLogin: 1,
        createdAt: 1,
        updatedAt: 1,
        sessionCount: 1,
        activeSessions: 1,
        completedSessions: 1,
        lastSessionDate: 1,
        totalSamples: 1
        // sessions field is automatically excluded since we don't include it
      }
    },
    { $sort: { [sortBy]: sortOrder } },
    { $skip: skip },
    { $limit: limit }
  ]);
};

// Static method to get system statistics
userSchema.statics.getSystemStats = function() {
  return this.aggregate([
    {
      $lookup: {
        from: 'sessions',
        localField: '_id',
        foreignField: 'userId',
        as: 'sessions'
      }
    },
    {
      $lookup: {
        from: 'datachunks',
        let: { userSessions: '$sessions.sessionId' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$sessionId', '$$userSessions'] }
            }
          }
        ],
        as: 'dataChunks'
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalSessions: { $sum: { $size: '$sessions' } },
        activeSessions: {
          $sum: {
            $size: {
              $filter: {
                input: '$sessions',
                cond: { $eq: ['$$this.status', 'active'] }
              }
            }
          }
        },
        completedSessions: {
          $sum: {
            $size: {
              $filter: {
                input: '$sessions',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            }
          }
        },
        totalDataChunks: { $sum: { $size: '$dataChunks' } },
        totalSamples: {
          $sum: {
            $reduce: {
              input: '$sessions',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.totalSamples'] }
            }
          }
        },
        usersWithSessions: {
          $sum: {
            $cond: [{ $gt: [{ $size: '$sessions' }, 0] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalUsers: 1,
        totalSessions: 1,
        activeSessions: 1,
        completedSessions: 1,
        totalDataChunks: 1,
        totalSamples: 1,
        usersWithSessions: 1,
        avgSessionsPerUser: {
          $cond: [
            { $gt: ['$totalUsers', 0] },
            { $divide: ['$totalSessions', '$totalUsers'] },
            0
          ]
        },
        avgSamplesPerSession: {
          $cond: [
            { $gt: ['$totalSessions', 0] },
            { $divide: ['$totalSamples', '$totalSessions'] },
            0
          ]
        }
      }
    }
  ]);
};

export default mongoose.model('User', userSchema);