import express from 'express';
import { body, query } from 'express-validator';
import asyncHandler from 'express-async-handler';
import Session from '../models/Session.js';
import DataChunk from '../models/DataChunk.js';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Session:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *           example: "session_1640995200000_user123"
 *         userId:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *         deviceId:
 *           type: string
 *           example: "HC-05_ABC123"
 *         deviceName:
 *           type: string
 *           example: "HC-05 Device"
 *         deviceType:
 *           type: string
 *           enum: [sEMG, IMU, null]
 *           example: "sEMG"
 *         startTime:
 *           type: string
 *           format: date-time
 *           example: "2024-01-01T10:00:00Z"
 *         endTime:
 *           type: string
 *           format: date-time
 *           example: "2024-01-01T10:15:00Z"
 *         sampleRate:
 *           type: number
 *           example: 1000
 *         channelCount:
 *           type: number
 *           example: 10
 *         totalSamples:
 *           type: number
 *           example: 900000
 *         status:
 *           type: string
 *           enum: [active, completed, error]
 *           example: "completed"
 *         duration:
 *           type: number
 *           description: Duration in seconds
 *           example: 900
 *         metadata:
 *           type: object
 *           properties:
 *             appVersion:
 *               type: string
 *             deviceInfo:
 *               type: object
 *             notes:
 *               type: string
 */

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: Get recording sessions (users and admins see only their own sessions)
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *           maximum: 100
 *         description: Maximum number of sessions to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *         description: Number of sessions to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, error]
 *         description: Filter by session status
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *         description: Filter by device ID
 *     responses:
 *       200:
 *         description: List of sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Session'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     offset:
 *                       type: number
 *                     hasMore:
 *                       type: boolean
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 */
router.get('/', protect, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('status')
    .optional()
    .isIn(['active', 'completed', 'error'])
    .withMessage('Status must be active, completed, or error'),
  query('deviceId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device ID must be a non-empty string')
], validateRequest, asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, status, deviceId } = req.query;
  
  // Build query filter - by default everyone sees only their own sessions
  const filter = {};
  filter.userId = req.user._id;
  if (status) filter.status = status;
  if (deviceId) filter.deviceId = deviceId;
  
  try {
    // Get total count for pagination
    const total = await Session.countDocuments(filter);
    
    // Get sessions with pagination
    const sessions = await Session.find(filter)
      .sort({ startTime: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();
    
    // Add computed fields
    const enrichedSessions = sessions.map(session => ({
      ...session,
      duration: session.endTime && session.startTime ? 
        Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 
        null,
      chunksCount: session.endTime && session.startTime ? 
        Math.ceil((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 
        0
    }));
    
    res.status(200).json({
      success: true,
      sessions: enrichedSessions,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving sessions'
    });
  }
}));

/**
 * @swagger
 * /api/sessions/{sessionId}:
 *   get:
 *     summary: Get detailed information about a specific session (users can only access their own, admins can access any)
 *     tags: [Sessions]
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
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 session:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Session'
 *                     - type: object
 *                       properties:
 *                         chunks:
 *                           type: number
 *                           description: Number of data chunks
 *                         actualSamples:
 *                           type: number
 *                           description: Actual samples in data chunks
 *                         dataIntegrity:
 *                           type: number
 *                           description: Data integrity percentage
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:sessionId', protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    // Build query - admins can access any session, users only their own
    const query = { sessionId };
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }
    
    // Get session details
    const session = await Session.findOne(query).lean();
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Get chunk statistics
    const chunkStats = await DataChunk.aggregate([
      { $match: { sessionId } },
      {
        $group: {
          _id: null,
          totalChunks: { $sum: 1 },
          actualSamples: { $sum: '$sampleCount' },
          firstChunk: { $min: '$startTime' },
          lastChunk: { $max: '$endTime' }
        }
      }
    ]);
    
    const stats = chunkStats[0] || { 
      totalChunks: 0, 
      actualSamples: 0, 
      firstChunk: null, 
      lastChunk: null 
    };
    
    // Calculate data integrity
    let dataIntegrity = 100;
    if (session.totalSamples > 0) {
      dataIntegrity = Math.min((stats.actualSamples / session.totalSamples) * 100, 100);
    }
    
    // Enrich session data
    const enrichedSession = {
      ...session,
      duration: session.endTime && session.startTime ? 
        Math.floor((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 
        null,
      chunks: stats.totalChunks,
      actualSamples: stats.actualSamples,
      dataIntegrity: Math.round(dataIntegrity * 100) / 100,
      dataTimeRange: stats.firstChunk && stats.lastChunk ? {
        start: stats.firstChunk,
        end: stats.lastChunk
      } : null
    };
    
    res.status(200).json({
      success: true,
      session: enrichedSession
    });
  } catch (error) {
    console.error('Error getting session details:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving session details'
    });
  }
}));

/**
 * @swagger
 * /api/sessions/{sessionId}/download:
 *   get:
 *     summary: Download session data as CSV (users can only download their own, admins can download any)
 *     tags: [Sessions]
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
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:sessionId/download', protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    // Build query - admins can download any session, users only their own
    const query = { sessionId };
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }
    
    // Get session details with user info
    const session = await Session.findOne(query).populate('userId', 'name email').lean();
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Get all data chunks for the session
    const chunks = await DataChunk.find({ sessionId })
      .sort({ chunkIndex: 1 })
      .lean();
    
    if (chunks.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found for this session'
      });
    }
    
    // Prepare CSV filename with username, device type, and creation datetime
    const username = session.userId?.name || 'Unknown';
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9]/g, '_');
    const deviceType = session.deviceType || 'Unknown';
    const creationDate = new Date(session.startTime).toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `session_${sanitizedUsername}_${deviceType}_${creationDate}.csv`;
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Write CSV header based on device type
    let headers;
    if (session.deviceType === 'IMU') {
      // IMU headers: timestamp, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, mag_x, mag_y, mag_z (9 channels)
      headers = ['timestamp', 'accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z', 'mag_x', 'mag_y', 'mag_z'];
    } else {
      // sEMG or default headers for EMG data
      headers = ['timestamp', 'ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9'];
    }
    res.write(headers.join(',') + '\n');
    
    // Process each chunk and write data
    for (const chunk of chunks) {
      const { timestamps } = chunk.data;
      const { channels } = chunk.data;
      
      // Write each sample as a row
      for (let i = 0; i < chunk.sampleCount; i++) {
        let row = [timestamps[i]];
        
        if (session.deviceType === 'IMU') {
          // For IMU data: ch0-2: accel XYZ, ch3-5: gyro XYZ, ch6-8: mag XYZ (9 channels total)
          for (let ch = 0; ch <= 8; ch++) {
            row.push(channels[`ch${ch}`][i]);
          }
        } else {
          // For sEMG data: ch0-9: EMG channels (10 channels total)
          for (let ch = 0; ch <= 9; ch++) {
            row.push(channels[`ch${ch}`][i]);
          }
        }
        
        res.write(row.join(',') + '\n');
      }
    }
    
    res.end();
  } catch (error) {
    console.error('Error downloading session data:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading session data'
    });
  }
}));

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Create a new recording session
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - deviceId
 *               - deviceName
 *               - startTime
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Unique session identifier
 *                 example: "session_1640995200000_user123"
 *               deviceId:
 *                 type: string
 *                 description: Device identifier
 *                 example: "HC-05_ABC123"
 *               deviceName:
 *                 type: string
 *                 description: Human-readable device name
 *                 example: "HC-05 Device"
 *               deviceType:
 *                 type: string
 *                 description: Type of device (sEMG or IMU)
 *                 enum: [sEMG, IMU]
 *                 example: "sEMG"
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 description: Session start time
 *                 example: "2024-01-01T10:00:00Z"
 *               sampleRate:
 *                 type: number
 *                 description: Expected sample rate (samples per second)
 *                 default: 1000
 *                 example: 1000
 *               channelCount:
 *                 type: number
 *                 description: Number of EMG channels
 *                 default: 10
 *                 example: 10
 *               metadata:
 *                 type: object
 *                 properties:
 *                   appVersion:
 *                     type: string
 *                     example: "1.0.0"
 *                   notes:
 *                     type: string
 *                     example: "Test recording session"
 *                   deviceInfo:
 *                     type: object
 *     responses:
 *       201:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Validation error or session already exists
 *       401:
 *         description: Unauthorized
 */
router.post('/', protect, [
  body('sessionId')
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Session ID must be between 10-100 characters'),
  body('deviceId')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device ID is required and must be under 100 characters'),
  body('deviceName')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device name is required and must be under 100 characters'),
  body('deviceType')
    .optional()
    .isIn(['sEMG', 'IMU', null])
    .withMessage('Device type must be sEMG, IMU, or null'),
  body('startTime')
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  body('sampleRate')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Sample rate must be between 1-10000'),
  body('channelCount')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Channel count must be between 1-20'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
], validateRequest, asyncHandler(async (req, res) => {
  const { sessionId, deviceId, deviceName, deviceType, startTime, sampleRate, channelCount, metadata } = req.body;
  
  try {
    // Check if session already exists
    const existingSession = await Session.findOne({ sessionId });
    if (existingSession) {
      return res.status(400).json({
        success: false,
        message: 'Session with this ID already exists'
      });
    }
    
    // Create new session
    const session = new Session({
      sessionId,
      userId: req.user._id,
      deviceId,
      deviceName,
      deviceType,
      startTime: new Date(startTime),
      sampleRate: sampleRate || 1000,
      channelCount: channelCount || 10,
      metadata: metadata || {}
    });
    
    await session.save();
    
    res.status(201).json({
      success: true,
      session: session.toObject({ virtuals: true })
    });
  } catch (error) {
    console.error('Error creating session:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Session with this ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating session'
    });
  }
}));

/**
 * @swagger
 * /api/sessions/{sessionId}/end:
 *   put:
 *     summary: End an active recording session
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endTime
 *             properties:
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 description: Session end time
 *                 example: "2024-01-01T10:15:00Z"
 *               totalSamples:
 *                 type: number
 *                 description: Final total sample count
 *                 example: 900000
 *     responses:
 *       200:
 *         description: Session ended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 session:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Validation error or session not active
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:sessionId/end', protect, [
  body('endTime')
    .isISO8601()
    .withMessage('End time must be a valid ISO 8601 date'),
  body('totalSamples')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total samples must be a non-negative integer')
], validateRequest, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { endTime, totalSamples } = req.body;
  
  try {
    // Build query - admins can end any session, users only their own
    const query = { sessionId };
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }
    
    const session = await Session.findOne(query);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Session is not active'
      });
    }
    
    // Validate end time is after start time
    const endDateTime = new Date(endTime);
    if (endDateTime <= session.startTime) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }
    
    // End the session
    session.endTime = endDateTime;
    session.status = 'completed';
    if (totalSamples !== undefined) {
      session.totalSamples = totalSamples;
    }
    
    await session.save();
    
    res.status(200).json({
      success: true,
      session: session.toObject({ virtuals: true })
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      success: false,
      message: 'Error ending session'
    });
  }
}));

/**
 * @swagger
 * /api/sessions/{sessionId}:
 *   delete:
 *     summary: Delete a session and all its data
 *     tags: [Sessions]
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
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Session and all associated data deleted successfully"
 *                 deletedChunks:
 *                   type: number
 *                   description: Number of data chunks deleted
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:sessionId', protect, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    // Build query - admins can delete any session, users only their own
    const query = { sessionId };
    if (req.user.role !== 'admin') {
      query.userId = req.user._id;
    }
    
    const session = await Session.findOne(query);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Delete all associated data chunks
    const deleteResult = await DataChunk.deleteMany({ sessionId });
    
    // Delete the session (no user restriction for admins)
    await Session.deleteOne({ sessionId });
    
    res.status(200).json({
      success: true,
      message: 'Session and all associated data deleted successfully',
      deletedChunks: deleteResult.deletedCount
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting session'
    });
  }
}));

export default router;