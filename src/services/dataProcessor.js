import DataChunk from '../models/DataChunk.js';
import Session from '../models/Session.js';

export class DataProcessor {
  
  /**
   * Process a batch of sEMG samples and accumulate them for final consolidation
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

      if (session.status === 'completed') {
        console.log(`⚠️ Received data for completed session ${sessionId}, ignoring...`);
        return {
          success: false,
          message: 'Session already completed',
          samplesProcessed: 0,
          sessionStatus: 'completed'
        };
      }

      if (session.status !== 'active') {
        throw new Error('Session is not active');
      }

      // Create temporary DataChunk with special flag for later consolidation
      const chunkData = this.transformToChunkFormat(samples);
      const stats = this.calculateAllChannelStats(chunkData.channels);
      
      // Count existing temporary chunks for this session
      const existingTempChunks = await DataChunk.countDocuments({ 
        sessionId, 
        'metadata.temporary': true 
      });
      
      console.log(`📊 Creating temporary chunk ${existingTempChunks} for session ${sessionId} with ${batchInfo.size} samples`);

      // Create temporary DataChunk
      const tempDataChunk = new DataChunk({
        sessionId,
        chunkIndex: existingTempChunks, // Temporary index
        startTime: new Date(batchInfo.startTime),
        endTime: new Date(batchInfo.endTime),
        sampleCount: batchInfo.size,
        data: chunkData,
        stats,
        metadata: {
          temporary: true, // Flag to identify temporary chunks
          batchOrder: existingTempChunks
        }
      });

      await tempDataChunk.save();

      // Update session metadata
      await this.updateSessionMetadata(session, batchInfo.size, deviceInfo);

      return {
        success: true,
        chunkId: tempDataChunk._id,
        chunkIndex: existingTempChunks,
        samplesProcessed: batchInfo.size,
        sessionStatus: session.status,
        isTemporary: true
      };

    } catch (error) {
      console.error('Data processing error:', error);
      throw error;
    }
  }

  /**
   * Finalize session and create consolidated DataChunk
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID for session validation
   * @returns {Object} Final processing result
   */
  async finalizeSession(sessionId, userId) {
    try {
      console.log(`🔚 Starting finalization for session ${sessionId}, userId: ${userId}`);
      
      // Find the session
      const session = await Session.findOne({ sessionId, userId });
      if (!session) {
        console.error(`❌ Session not found: ${sessionId} for user ${userId}`);
        throw new Error('Session not found or access denied');
      }

      console.log(`📋 Session found: ${session.sessionId}, status: ${session.status}`);

      // Find all temporary DataChunks for this session
      const tempChunks = await DataChunk.find({ 
        sessionId, 
        'metadata.temporary': true 
      }).sort({ 'metadata.batchOrder': 1 });

      console.log(`📊 Found ${tempChunks.length} temporary chunks for session ${sessionId}`);

      if (tempChunks.length === 0) {
        console.log(`⚠️ No temporary chunks found for session ${sessionId}`);
        return {
          success: true,
          message: 'No data to finalize',
          samplesProcessed: 0
        };
      }

      // Consolidate all samples from temporary chunks
      const allSamples = [];
      let totalSamples = 0;
      let sessionStartTime = null;
      let sessionEndTime = null;

      for (const chunk of tempChunks) {
        // Extract samples from chunk format back to array
        const chunkSamples = this.extractSamplesFromChunk(chunk);
        allSamples.push(...chunkSamples);
        totalSamples += chunk.sampleCount;
        
        if (!sessionStartTime || chunk.startTime < sessionStartTime) {
          sessionStartTime = chunk.startTime;
        }
        if (!sessionEndTime || chunk.endTime > sessionEndTime) {
          sessionEndTime = chunk.endTime;
        }
      }

      console.log(`🚀 Consolidating ${tempChunks.length} temporary chunks into single chunk with ${totalSamples} total samples`);

      // Sort samples by timestamp to ensure chronological order
      // (Frontend CircularBuffer returns newest-to-oldest, we need oldest-to-newest)
      allSamples.sort((a, b) => a.timestamp - b.timestamp);
      console.log(`📈 Sorted ${allSamples.length} samples chronologically`);

      // Transform all consolidated samples to chunk format
      const chunkData = this.transformToChunkFormat(allSamples);
      
      // Calculate statistics for each channel
      const stats = this.calculateAllChannelStats(chunkData.channels);

      // Delete all temporary chunks FIRST to avoid chunkIndex conflicts
      const deleteResult = await DataChunk.deleteMany({ 
        sessionId, 
        'metadata.temporary': true 
      });

      console.log(`🗑️ Deleted ${deleteResult.deletedCount} temporary chunks`);

      // Now create the final consolidated DataChunk
      const dataChunk = new DataChunk({
        sessionId,
        chunkIndex: 0, // Single chunk for the entire session
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        sampleCount: totalSamples,
        data: chunkData,
        stats,
        metadata: {
          consolidated: true, // Mark as final consolidated chunk
          originalChunks: tempChunks.length
        }
      });

      await dataChunk.save();

      // Update session as completed
      session.status = 'completed';
      session.endTime = sessionEndTime;
      session.totalSamples = totalSamples;
      
      await session.save();

      console.log(`✅ Session ${sessionId} finalized with ${totalSamples} samples in single DataChunk (consolidated from ${tempChunks.length} temporary chunks)`);

      return {
        success: true,
        chunkId: dataChunk._id,
        samplesProcessed: totalSamples,
        sessionStatus: 'completed',
        consolidatedChunks: tempChunks.length
      };

    } catch (error) {
      console.error('Session finalization error:', error);
      throw error;
    }
  }

  /**
   * Extract samples from chunk format back to array
   * @param {Object} chunk - DataChunk document
   * @returns {Array} Array of {timestamp, values, sessionId}
   */
  extractSamplesFromChunk(chunk) {
    const samples = [];
    const { timestamps, channels } = chunk.data;
    
    for (let i = 0; i < timestamps.length; i++) {
      const values = [];
      for (let channelIndex = 0; channelIndex < 10; channelIndex++) {
        const channelKey = `ch${channelIndex}`;
        values.push(channels[channelKey][i]);
      }
      
      samples.push({
        timestamp: timestamps[i],
        values,
        sessionId: chunk.sessionId
      });
    }
    
    return samples;
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