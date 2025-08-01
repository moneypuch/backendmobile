import express from 'express';
import { query, param } from 'express-validator';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Session from '../models/Session.js';
import DataChunk from '../models/DataChunk.js';
import { protect, requireAdmin } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminUserSummary:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *         isVerified:
 *           type: boolean
 *         lastLogin:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         sessionCount:
 *           type: number
 *         activeSessions:
 *           type: number
 *         completedSessions:
 *           type: number
 *         lastSessionDate:
 *           type: string
 *           format: date-time
 *         totalSamples:
 *           type: number
 *     
 *     SystemStats:
 *       type: object
 *       properties:
 *         totalUsers:
 *           type: number
 *         totalSessions:
 *           type: number
 *         activeSessions:
 *           type: number
 *         completedSessions:
 *           type: number
 *         totalDataChunks:
 *           type: number
 *         totalSamples:
 *           type: number
 *         usersWithSessions:
 *           type: number
 *         avgSessionsPerUser:
 *           type: number
 *         avgSamplesPerSession:
 *           type: number
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users with session counts (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *           maximum: 100
 *         description: Maximum number of users to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, sessionCount, lastLogin, name, email]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of users with session statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminUserSummary'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     total:
 *                       type: number
 *                     hasMore:
 *                       type: boolean
 *       403:
 *         description: Admin access required
 */
router.get('/users', protect, requireAdmin, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be at least 1'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'sessionCount', 'lastLogin', 'name', 'email'])
    .withMessage('Invalid sortBy field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
], validateRequest, asyncHandler(async (req, res) => {
  const { limit = 50, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortValue = sortOrder === 'asc' ? 1 : -1;

  try {
    // Get users with session counts
    const users = await User.getUsersWithSessionCount({
      limit: parseInt(limit),
      skip,
      sortBy,
      sortOrder: sortValue
    });

    // Get total count for pagination
    const totalUsers = await User.countDocuments();

    res.status(200).json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalUsers,
        hasMore: totalUsers > skip + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting users with session counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user data'
    });
  }
}));

/**
 * @swagger
 * /api/admin/users/{userId}/sessions:
 *   get:
 *     summary: Get sessions for a specific user (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *         description: Maximum number of sessions to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, error]
 *         description: Filter by session status
 *     responses:
 *       200:
 *         description: User sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Session'
 *                 pagination:
 *                   type: object
 *       404:
 *         description: User not found
 *       403:
 *         description: Admin access required
 */
router.get('/users/:userId/sessions', protect, requireAdmin, [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be at least 1'),
  query('status')
    .optional()
    .isIn(['active', 'completed', 'error'])
    .withMessage('Invalid status filter')
], validateRequest, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { limit = 20, page = 1, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Verify user exists
    const user = await User.findById(userId).select('name email role');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Build query filter
    const filter = { userId: new mongoose.Types.ObjectId(userId) };
    if (status) filter.status = status;

    // Get sessions with pagination
    const sessions = await Session.find(filter)
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalSessions = await Session.countDocuments(filter);

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
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      sessions: enrichedSessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalSessions,
        hasMore: totalSessions > skip + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting user sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user sessions'
    });
  }
}));

/**
 * @swagger
 * /api/admin/sessions/{sessionId}:
 *   delete:
 *     summary: Delete any session and its data (Admin only)
 *     tags: [Admin]
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
 *                 message:
 *                   type: string
 *                 deletedChunks:
 *                   type: number
 *       404:
 *         description: Session not found
 *       403:
 *         description: Admin access required
 */
router.delete('/sessions/:sessionId', protect, requireAdmin, [
  param('sessionId')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Session ID is required')
], validateRequest, asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await Session.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Delete all associated data chunks
    const deleteResult = await DataChunk.deleteMany({ sessionId });
    
    // Delete the session
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

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get system-wide statistics (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   $ref: '#/components/schemas/SystemStats'
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Admin access required
 */
router.get('/stats', protect, requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Get system statistics
    const systemStats = await User.getSystemStats();
    const stats = systemStats[0] || {
      totalUsers: 0,
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      totalDataChunks: 0,
      totalSamples: 0,
      usersWithSessions: 0,
      avgSessionsPerUser: 0,
      avgSamplesPerSession: 0
    };

    // Additional real-time stats
    const [recentSessions, activeSessionsCount] = await Promise.all([
      Session.find()
        .sort({ startTime: -1 })
        .limit(10)
        .select('sessionId startTime status totalSamples')
        .lean(),
      Session.countDocuments({ status: 'active' })
    ]);

    // Calculate storage usage estimate
    const totalDataChunks = await DataChunk.countDocuments();
    const avgChunkSize = 50; // KB estimate per chunk
    const storageUsageMB = (totalDataChunks * avgChunkSize) / 1024;

    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        recentSessions,
        activeSessionsRealtime: activeSessionsCount,
        storageUsageMB: Math.round(storageUsageMB * 100) / 100
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving system statistics'
    });
  }
}));

export default router;