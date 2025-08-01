import express from 'express';
import { body } from 'express-validator';
import asyncHandler from 'express-async-handler';
import Session from '../models/Session.js';
import DataChunk from '../models/DataChunk.js';
import DataProcessor from '../services/dataProcessor.js';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();
const dataProcessor = new DataProcessor();

/**
 * @swagger
 * components:
 *   schemas:
 *     SampleData:
 *       type: object
 *       required:
 *         - timestamp
 *         - values
 *         - sessionId
 *       properties:
 *         timestamp:
 *           type: number
 *           description: Unix timestamp in milliseconds
 *           example: 1640995200000
 *         values:
 *           type: array
 *           items:
 *             type: number
 *           minItems: 10
 *           maxItems: 10
 *           description: Array of 10 channel values
 *           example: [123.45, 234.56, 345.67, 456.78, 567.89, 678.90, 789.01, 890.12, 901.23, 012.34]
 *         sessionId:
 *           type: string
 *           description: Session identifier
 *           example: "session_1640995200000_user123"
 *     
 *     BatchRequest:
 *       type: object
 *       required:
 *         - sessionId
 *         - samples
 *         - deviceInfo
 *         - batchInfo
 *       properties:
 *         sessionId:
 *           type: string
 *           description: Session identifier
 *           example: "session_1640995200000_user123"
 *         samples:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SampleData'
 *           minItems: 1
 *           maxItems: 1000
 *           description: Array of sample data
 *         deviceInfo:
 *           type: object
 *           required:
 *             - name
 *             - address
 *           properties:
 *             name:
 *               type: string
 *               example: "HC-05 Device"
 *             address:
 *               type: string
 *               example: "98:D3:31:FB:4E:7C"
 *         batchInfo:
 *           type: object
 *           required:
 *             - size
 *             - startTime
 *             - endTime
 *           properties:
 *             size:
 *               type: number
 *               minimum: 1
 *               maximum: 1000
 *               example: 1000
 *             startTime:
 *               type: number
 *               example: 1640995200000
 *             endTime:
 *               type: number
 *               example: 1640995201000
 */

/**
 * @swagger
 * /api/semg/batch:
 *   post:
 *     summary: Upload batch of sEMG data samples
 *     tags: [sEMG Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchRequest'
 *     responses:
 *       200:
 *         description: Batch processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 chunkId:
 *                   type: string
 *                   example: "507f1f77bcf86cd799439011"
 *                 chunkIndex:
 *                   type: number
 *                   example: 42
 *                 samplesProcessed:
 *                   type: number
 *                   example: 1000
 *                 sessionStatus:
 *                   type: string
 *                   example: "active"
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 *       500:
 *         description: Internal server error
 */
router.post('/batch', protect, [
  body('sessionId')
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Session ID must be a string between 10-100 characters'),
  body('samples')
    .isArray({ min: 1, max: 1000 })
    .withMessage('Samples must be an array with 1-1000 items'),
  body('samples.*.timestamp')
    .isNumeric()
    .custom(value => value > 0)
    .withMessage('Timestamp must be a positive number'),
  body('samples.*.values')
    .isArray({ min: 10, max: 10 })
    .withMessage('Each sample must have exactly 10 channel values'),
  body('samples.*.values.*')
    .isNumeric()
    .withMessage('All channel values must be numbers'),
  body('samples.*.sessionId')
    .isString()
    .withMessage('Each sample must have a sessionId'),
  body('deviceInfo.name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device name is required'),
  body('deviceInfo.address')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Device address is required'),
  body('batchInfo.size')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Batch size must be between 1-1000'),
  body('batchInfo.startTime')
    .isNumeric()
    .custom(value => value > 0)
    .withMessage('Start time must be a positive number'),
  body('batchInfo.endTime')
    .isNumeric()
    .custom(value => value > 0)
    .withMessage('End time must be a positive number')
], validateRequest, asyncHandler(async (req, res) => {
  
  // Validate batch data integrity
  const validation = dataProcessor.validateBatchData(req.body);
  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Batch data validation failed',
      errors: validation.errors
    });
  }

  try {
    const result = await dataProcessor.processBatch(req.body, req.user._id);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Batch processing error:', error);
    
    if (error.message.includes('Session not found') || error.message.includes('access denied')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.message.includes('not active')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error processing batch data'
    });
  }
}));

/**
 * @swagger
 * /api/semg/sessions/{sessionId}/stats:
 *   get:
 *     summary: Get processing statistics for a session (users can only access their own, admins can access any)
 *     tags: [sEMG Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     session:
 *                       type: object
 *                       properties:
 *                         sessionId:
 *                           type: string
 *                         status:
 *                           type: string
 *                         duration:
 *                           type: number
 *                         totalSamples:
 *                           type: number
 *                         sampleRate:
 *                           type: number
 *                         channelCount:
 *                           type: number
 *                     processing:
 *                       type: object
 *                       properties:
 *                         chunksProcessed:
 *                           type: number
 *                         samplesProcessed:
 *                           type: number
 *                         avgSampleRate:
 *                           type: number
 *                         dataIntegrity:
 *                           type: number
 *       404:
 *         description: Session not found
 */
router.get('/sessions/:sessionId/stats', protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  // Build query - admins can access any session stats, users only their own
  const query = { sessionId };
  if (req.user.role !== 'admin') {
    query.userId = req.user._id;
  }
  
  // Verify session exists and user has access
  const session = await Session.findOne(query);
  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Session not found'
    });
  }
  
  try {
    const stats = await dataProcessor.getProcessingStats(sessionId);
    
    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting session stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving session statistics'
    });
  }
}));

/**
 * @swagger
 * /api/semg/sessions/{sessionId}/data:
 *   get:
 *     summary: Get sEMG data for a session with optional time range filtering (users can only access their own, admins can access any)
 *     tags: [sEMG Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: number
 *         description: Start time filter (Unix timestamp)
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: number
 *         description: End time filter (Unix timestamp)
 *       - in: query
 *         name: channels
 *         schema:
 *           type: string
 *         description: Comma-separated channel numbers (0-9)
 *         example: "0,1,2"
 *       - in: query
 *         name: maxPoints
 *         schema:
 *           type: number
 *           default: 10000
 *         description: Maximum number of data points to return
 *     responses:
 *       200:
 *         description: Session data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                     timeRange:
 *                       type: array
 *                       items:
 *                         type: number
 *                     chunks:
 *                       type: number
 *                     channels:
 *                       type: object
 *                     stats:
 *                       type: object
 *       404:
 *         description: Session not found
 */
router.get('/sessions/:sessionId/data', protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { startTime, endTime, channels, maxPoints = 10000 } = req.query;
  
  // Build query - admins can access any session data, users only their own
  const query = { sessionId };
  if (req.user.role !== 'admin') {
    query.userId = req.user._id;
  }
  
  // Verify session exists and user has access
  const session = await Session.findOne(query);
  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Session not found'
    });
  }
  
  try {
    // Parse channels if provided
    const requestedChannels = channels ? 
      channels.split(',').map(ch => parseInt(ch.trim())).filter(ch => ch >= 0 && ch <= 9) : 
      null;
    
    // Get data chunks
    let query = DataChunk.find({ sessionId }).sort({ chunkIndex: 1 });
    
    // Apply time range filter if provided
    if (startTime && endTime) {
      const start = new Date(parseInt(startTime));
      const end = new Date(parseInt(endTime));
      query = DataChunk.getDataInRange(sessionId, start, end, requestedChannels);
    } else if (requestedChannels) {
      // If only channels filter, apply projection
      let projection = {
        sessionId: 1,
        chunkIndex: 1,
        startTime: 1,
        endTime: 1,
        sampleCount: 1,
        'data.timestamps': 1,
        stats: 1
      };
      
      requestedChannels.forEach(ch => {
        projection[`data.channels.ch${ch}`] = 1;
        projection[`stats.ch${ch}`] = 1;
      });
      
      query = query.select(projection);
    }
    
    const chunks = await query.exec();
    
    // Prepare response data
    const responseData = {
      sessionId,
      timeRange: [
        chunks[0]?.startTime?.getTime() || null,
        chunks[chunks.length - 1]?.endTime?.getTime() || null
      ],
      chunks: chunks.length,
      totalSamples: chunks.reduce((sum, chunk) => sum + chunk.sampleCount, 0),
      channels: {},
      stats: {}
    };
    
    // Aggregate channel data and stats
    const channelsToProcess = requestedChannels || [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    
    channelsToProcess.forEach(chNum => {
      const channelKey = `ch${chNum}`;
      responseData.channels[channelKey] = [];
      responseData.stats[channelKey] = {
        min: Infinity,
        max: -Infinity,
        avg: 0,
        rms: 0,
        count: 0
      };
    });
    
    // Process chunks and aggregate data
    chunks.forEach(chunk => {
      channelsToProcess.forEach(chNum => {
        const channelKey = `ch${chNum}`;
        const channelData = chunk.data.channels[channelKey] || [];
        const channelStats = chunk.stats[channelKey];
        
        // Add data points with timestamps
        channelData.forEach((value, index) => {
          const timestamp = chunk.data.timestamps[index];
          responseData.channels[channelKey].push({
            timestamp,
            value
          });
        });
        
        // Update aggregated stats
        if (channelStats) {
          const stats = responseData.stats[channelKey];
          stats.min = Math.min(stats.min, channelStats.min);
          stats.max = Math.max(stats.max, channelStats.max);
          stats.count += channelData.length;
          
          // Weighted average for avg and rms
          const totalCount = stats.count;
          const prevCount = totalCount - channelData.length;
          if (prevCount > 0) {
            stats.avg = (stats.avg * prevCount + channelStats.avg * channelData.length) / totalCount;
            stats.rms = Math.sqrt((Math.pow(stats.rms, 2) * prevCount + Math.pow(channelStats.rms, 2) * channelData.length) / totalCount);
          } else {
            stats.avg = channelStats.avg;
            stats.rms = channelStats.rms;
          }
        }
      });
    });
    
    // Apply maxPoints limit if needed (decimation)
    const totalPoints = Math.max(...channelsToProcess.map(ch => responseData.channels[`ch${ch}`].length));
    if (totalPoints > maxPoints) {
      const decimationFactor = Math.ceil(totalPoints / maxPoints);
      
      channelsToProcess.forEach(chNum => {
        const channelKey = `ch${chNum}`;
        const originalData = responseData.channels[channelKey];
        responseData.channels[channelKey] = originalData.filter((_, index) => index % decimationFactor === 0);
      });
    }
    
    res.status(200).json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Error getting session data:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving session data'
    });
  }
}));

export default router;