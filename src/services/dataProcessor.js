import DataChunk from '../models/DataChunk.js';
import Session from '../models/Session.js';

export class DataProcessor {
  
  /**
   * Process a batch of sEMG samples and store as data chunk
   * @param {Object} batchData - Batch data from mobile app
   * @param {string} userId - User ID for session validation
   * @returns {Object} Processing result
   */
  async processBatch(batchData, userId) {
    try {
      const { sessionId, samples, deviceInfo, batchInfo } = batchData;

      // Validate session exists and belongs to user
      const session = await Session.findOne({ sessionId, userId });
      if (!session) {
        throw new Error('Session not found or access denied');
      }

      if (session.status !== 'active') {
        throw new Error('Session is not active');
      }

      // Transform samples to chunk format
      const chunkData = this.transformToChunkFormat(samples);
      
      // Calculate statistics for each channel
      const stats = this.calculateAllChannelStats(chunkData.channels);
      
      // Determine chunk index based on existing chunks
      const existingChunks = await DataChunk.countDocuments({ sessionId });
      const chunkIndex = existingChunks;

      // Create data chunk
      const dataChunk = new DataChunk({
        sessionId,
        chunkIndex,
        startTime: new Date(batchInfo.startTime),
        endTime: new Date(batchInfo.endTime),
        sampleCount: batchInfo.size,
        data: chunkData,
        stats
      });

      await dataChunk.save();

      // Update session metadata
      await this.updateSessionMetadata(session, batchInfo.size, deviceInfo);

      return {
        success: true,
        chunkId: dataChunk._id,
        chunkIndex,
        samplesProcessed: batchInfo.size,
        sessionStatus: session.status
      };

    } catch (error) {
      console.error('Data processing error:', error);
      throw error;
    }
  }

  /**
   * Transform array of samples to chunk format
   * @param {Array} samples - Array of {timestamp, values, sessionId}
   * @returns {Object} Chunk format {timestamps: [], channels: {ch0: [], ch1: []...}}
   */
  transformToChunkFormat(samples) {
    const chunkData = {
      timestamps: [],
      channels: {
        ch0: [], ch1: [], ch2: [], ch3: [], ch4: [],
        ch5: [], ch6: [], ch7: [], ch8: [], ch9: []
      }
    };

    samples.forEach(sample => {
      chunkData.timestamps.push(sample.timestamp);
      
      // Ensure we have exactly 10 channel values
      const values = sample.values.slice(0, 10);
      while (values.length < 10) {
        values.push(0); // Pad with zeros if needed
      }
      
      values.forEach((value, channelIndex) => {
        const channelKey = `ch${channelIndex}`;
        chunkData.channels[channelKey].push(value);
      });
    });

    return chunkData;
  }

  /**
   * Calculate statistics for all channels
   * @param {Object} channels - Channel data object
   * @returns {Object} Statistics for all channels
   */
  calculateAllChannelStats(channels) {
    const stats = {};
    
    for (let i = 0; i < 10; i++) {
      const channelKey = `ch${i}`;
      stats[channelKey] = this.calculateChannelStats(channels[channelKey] || []);
    }
    
    return stats;
  }

  /**
   * Calculate statistics for a single channel
   * @param {Array} values - Array of numeric values
   * @returns {Object} Statistics {min, max, avg, rms}
   */
  calculateChannelStats(values) {
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
  }

  /**
   * Update session metadata after processing batch
   * @param {Object} session - Session document
   * @param {number} samplesCount - Number of samples processed
   * @param {Object} deviceInfo - Device information
   */
  async updateSessionMetadata(session, samplesCount, deviceInfo) {
    try {
      session.totalSamples += samplesCount;
      
      // Update device info if provided
      if (deviceInfo) {
        session.deviceName = deviceInfo.name || session.deviceName;
        session.metadata.deviceInfo = {
          ...session.metadata.deviceInfo,
          ...deviceInfo
        };
      }

      await session.save();
    } catch (error) {
      console.error('Error updating session metadata:', error);
      // Don't throw here as the main data processing succeeded
    }
  }

  /**
   * Validate batch data integrity
   * @param {Object} batchData - Batch data to validate
   * @returns {Object} Validation result
   */
  validateBatchData(batchData) {
    const errors = [];
    const { samples, batchInfo } = batchData;

    // Check sample count consistency
    if (samples.length !== batchInfo.size) {
      errors.push(`Sample count mismatch: expected ${batchInfo.size}, got ${samples.length}`);
    }

    // Check timestamp consistency
    const firstTimestamp = samples[0]?.timestamp;
    const lastTimestamp = samples[samples.length - 1]?.timestamp;
    
    if (firstTimestamp !== batchInfo.startTime) {
      errors.push('First sample timestamp does not match batch start time');
    }

    if (Math.abs(lastTimestamp - batchInfo.endTime) > 10) { // Allow 10ms tolerance
      errors.push('Last sample timestamp does not match batch end time');
    }

    // Check channel value consistency
    samples.forEach((sample, index) => {
      if (!Array.isArray(sample.values) || sample.values.length !== 10) {
        errors.push(`Sample ${index}: Expected 10 channel values, got ${sample.values?.length || 0}`);
      }
      
      sample.values?.forEach((value, channelIndex) => {
        if (typeof value !== 'number' || !isFinite(value)) {
          errors.push(`Sample ${index}, Channel ${channelIndex}: Invalid value ${value}`);
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get processing statistics
   * @param {string} sessionId - Session ID
   * @returns {Object} Processing statistics
   */
  async getProcessingStats(sessionId) {
    try {
      const [session, chunksStats] = await Promise.all([
        Session.findOne({ sessionId }),
        DataChunk.getSessionStats(sessionId)
      ]);

      if (!session) {
        throw new Error('Session not found');
      }

      const stats = chunksStats[0] || {};
      
      return {
        session: {
          sessionId: session.sessionId,
          status: session.status,
          duration: session.duration,
          totalSamples: session.totalSamples,
          sampleRate: session.sampleRate,
          channelCount: session.channelCount
        },
        processing: {
          chunksProcessed: stats.totalChunks || 0,
          samplesProcessed: stats.totalSamples || 0,
          avgSampleRate: stats.avgSampleRate || 0,
          dataIntegrity: Math.min(stats.dataIntegrity || 0, 100),
          startTime: stats.startTime,
          endTime: stats.endTime
        }
      };
    } catch (error) {
      console.error('Error getting processing stats:', error);
      throw error;
    }
  }
}

export default DataProcessor;