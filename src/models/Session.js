import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required']
  },
  deviceName: {
    type: String,
    required: [true, 'Device name is required']
  },
  deviceType: {
    type: String,
    enum: ['sEMG', 'IMU', null],
    default: null
  },
  sessionType: {
    type: String,
    enum: ['raw', 'normalized'],
    default: 'raw',
    index: true
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
    index: true
  },
  endTime: {
    type: Date,
    default: null
  },
  sampleRate: {
    type: Number,
    default: 1000,
    min: [1, 'Sample rate must be at least 1']
  },
  channelCount: {
    type: Number,
    default: 10,
    min: [1, 'Channel count must be at least 1'],
    max: [20, 'Channel count cannot exceed 20']
  },
  totalSamples: {
    type: Number,
    default: 0,
    min: [0, 'Total samples cannot be negative']
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'error'],
    default: 'active'
  },
  metadata: {
    appVersion: {
      type: String,
      default: ''
    },
    deviceInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    notes: {
      type: String,
      default: ''
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
sessionSchema.index({ userId: 1, startTime: -1 });
sessionSchema.index({ sessionId: 1, userId: 1 });
sessionSchema.index({ status: 1, startTime: -1 });

// Virtual for session duration in seconds
sessionSchema.virtual('duration').get(function() {
  if (this.endTime && this.startTime) {
    return Math.floor((this.endTime - this.startTime) / 1000);
  }
  return null;
});

// Virtual for chunks count estimation
sessionSchema.virtual('chunksCount').get(function() {
  if (this.duration) {
    return Math.ceil(this.duration);
  }
  return 0;
});

// Method to end session
sessionSchema.methods.endSession = function(totalSamples) {
  this.endTime = new Date();
  this.status = 'completed';
  if (totalSamples !== undefined) {
    this.totalSamples = totalSamples;
  }
  return this.save();
};

// Method to mark session as error
sessionSchema.methods.markAsError = function(error) {
  this.status = 'error';
  this.metadata.error = error;
  return this.save();
};

// Static method to find active sessions for user
sessionSchema.statics.findActiveSessions = function(userId) {
  return this.find({ userId, status: 'active' }).sort({ startTime: -1 });
};

// Static method to get session statistics
sessionSchema.statics.getSessionStats = function(sessionId) {
  return this.aggregate([
    { $match: { sessionId } },
    {
      $lookup: {
        from: 'datachunks',
        localField: 'sessionId',
        foreignField: 'sessionId',
        as: 'chunks'
      }
    },
    {
      $addFields: {
        actualChunksCount: { $size: '$chunks' },
        dataIntegrity: {
          $cond: {
            if: { $gt: ['$totalSamples', 0] },
            then: {
              $multiply: [
                { $divide: [{ $size: '$chunks' }, { $divide: ['$totalSamples', '$sampleRate'] }] },
                100
              ]
            },
            else: 0
          }
        }
      }
    }
  ]);
};

export default mongoose.model('Session', sessionSchema);