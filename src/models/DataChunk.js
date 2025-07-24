import mongoose from 'mongoose';

// Schema for channel statistics
const channelStatsSchema = new mongoose.Schema({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  avg: { type: Number, required: true },
  rms: { type: Number, required: true }
}, { _id: false });

// Schema for channel data (ch0-ch9)
const channelDataSchema = new mongoose.Schema({
  ch0: [{ type: Number, required: true }],
  ch1: [{ type: Number, required: true }],
  ch2: [{ type: Number, required: true }],
  ch3: [{ type: Number, required: true }],
  ch4: [{ type: Number, required: true }],
  ch5: [{ type: Number, required: true }],
  ch6: [{ type: Number, required: true }],
  ch7: [{ type: Number, required: true }],
  ch8: [{ type: Number, required: true }],
  ch9: [{ type: Number, required: true }]
}, { _id: false });

// Schema for channel statistics (ch0-ch9)
const channelStatsCollectionSchema = new mongoose.Schema({
  ch0: { type: channelStatsSchema, required: true },
  ch1: { type: channelStatsSchema, required: true },
  ch2: { type: channelStatsSchema, required: true },
  ch3: { type: channelStatsSchema, required: true },
  ch4: { type: channelStatsSchema, required: true },
  ch5: { type: channelStatsSchema, required: true },
  ch6: { type: channelStatsSchema, required: true },
  ch7: { type: channelStatsSchema, required: true },
  ch8: { type: channelStatsSchema, required: true },
  ch9: { type: channelStatsSchema, required: true }
}, { _id: false });

const dataChunkSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    index: true
  },
  chunkIndex: {
    type: Number,
    required: [true, 'Chunk index is required'],
    min: [0, 'Chunk index cannot be negative']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: Date,
    required: [true, 'End time is required']
  },
  sampleCount: {
    type: Number,
    required: [true, 'Sample count is required'],
    min: [1, 'Sample count must be at least 1'],
    max: [2000, 'Sample count cannot exceed 2000']
  },
  data: {
    timestamps: {
      type: [Number],
      required: [true, 'Timestamps are required'],
      validate: {
        validator: function(timestamps) {
          return timestamps.length === this.sampleCount;
        },
        message: 'Timestamps length must match sample count'
      }
    },
    channels: {
      type: channelDataSchema,
      required: [true, 'Channel data is required'],
      validate: {
        validator: function(channels) {
          // Check that all channels have the same length as sampleCount
          const channelNames = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9'];
          return channelNames.every(ch => 
            channels[ch] && channels[ch].length === this.sampleCount
          );
        },
        message: 'All channels must have the same length as sample count'
      }
    }
  },
  stats: {
    type: channelStatsCollectionSchema,
    required: [true, 'Channel statistics are required']
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
dataChunkSchema.index({ sessionId: 1, chunkIndex: 1 }, { unique: true });
dataChunkSchema.index({ sessionId: 1, startTime: 1, endTime: 1 });
dataChunkSchema.index({ sessionId: 1, startTime: 1 });

// Static method to get data for time range
dataChunkSchema.statics.getDataInRange = function(sessionId, startTime, endTime, channels = null) {
  const match = {
    sessionId,
    $or: [
      { startTime: { $gte: new Date(startTime), $lte: new Date(endTime) } },
      { endTime: { $gte: new Date(startTime), $lte: new Date(endTime) } },
      { startTime: { $lte: new Date(startTime) }, endTime: { $gte: new Date(endTime) } }
    ]
  };

  let projection = {
    sessionId: 1,
    chunkIndex: 1,
    startTime: 1,
    endTime: 1,
    sampleCount: 1,
    'data.timestamps': 1,
    stats: 1
  };

  // If specific channels requested, only include those
  if (channels && Array.isArray(channels)) {
    channels.forEach(ch => {
      projection[`data.channels.ch${ch}`] = 1;
      projection[`stats.ch${ch}`] = 1;
    });
  } else {
    projection['data.channels'] = 1;
  }

  return this.find(match, projection).sort({ chunkIndex: 1 });
};

// Static method to get aggregated statistics for session
dataChunkSchema.statics.getSessionStats = function(sessionId) {
  return this.aggregate([
    { $match: { sessionId } },
    {
      $group: {
        _id: '$sessionId',
        totalChunks: { $sum: 1 },
        totalSamples: { $sum: '$sampleCount' },
        startTime: { $min: '$startTime' },
        endTime: { $max: '$endTime' },
        avgSampleRate: { $avg: '$sampleCount' },
        channelStats: {
          $push: '$stats'
        }
      }
    },
    {
      $addFields: {
        duration: {
          $divide: [
            { $subtract: ['$endTime', '$startTime'] },
            1000
          ]
        },
        dataIntegrity: {
          $multiply: [
            { $divide: ['$totalChunks', '$duration'] },
            100
          ]
        }
      }
    }
  ]);
};

// Static method to calculate channel statistics
dataChunkSchema.statics.calculateChannelStats = function(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, rms: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((acc, val) => acc + val, 0);
  const avg = sum / values.length;
  
  // Calculate RMS (Root Mean Square)
  const sumSquares = values.reduce((acc, val) => acc + (val * val), 0);
  const rms = Math.sqrt(sumSquares / values.length);

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    avg: Number(avg.toFixed(4)),
    rms: Number(rms.toFixed(4))
  };
};

// Method to get chunk data with time filtering
dataChunkSchema.methods.getDataInTimeRange = function(startTime, endTime) {
  const data = {
    timestamps: [],
    channels: {}
  };
  
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  
  // Filter timestamps and corresponding channel data
  this.data.timestamps.forEach((timestamp, index) => {
    if (timestamp >= start && timestamp <= end) {
      data.timestamps.push(timestamp);
      
      // Initialize channels if not done
      if (Object.keys(data.channels).length === 0) {
        for (let i = 0; i < 10; i++) {
          data.channels[`ch${i}`] = [];
        }
      }
      
      // Add channel data for this timestamp
      for (let i = 0; i < 10; i++) {
        const channelKey = `ch${i}`;
        if (this.data.channels[channelKey] && this.data.channels[channelKey][index] !== undefined) {
          data.channels[channelKey].push(this.data.channels[channelKey][index]);
        }
      }
    }
  });
  
  return data;
};

export default mongoose.model('DataChunk', dataChunkSchema);