import express from 'express';
import { body, query } from 'express-validator';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, admin]
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/', [
  protect,
  authorize('admin'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().escape(),
  query('role').optional().isIn(['user', 'admin'])
], validateRequest, asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 10;
  const search = req.query.search;
  const role = req.query.role;

  // Build query
  let query = {};
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (role) {
    query.role = role;
  }

  // Execute query with pagination
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Users can only view their own profile, admins can view any
  if (req.user.role !== 'admin' && req.user._id.toString() !== user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this user'
    });
  }

  res.status(200).json({
    success: true,
    data: user.profile
  });
}));

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: Only admins can change roles
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 */
router.put('/:id', [
  protect,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin')
], validateRequest, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Users can only update their own profile, admins can update any
  if (req.user.role !== 'admin' && req.user._id.toString() !== user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this user'
    });
  }

  // Only admins can change roles
  if (req.body.role && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to change user roles'
    });
  }

  // Check if email is already taken by another user
  if (req.body.email && req.body.email !== user.email) {
    const emailExists = await User.findOne({ 
      email: req.body.email,
      _id: { $ne: user._id }
    });
    
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email is already in use'
      });
    }
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        ...(req.body.name && { name: req.body.name }),
        ...(req.body.email && { email: req.body.email }),
        ...(req.body.role && { role: req.body.role })
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    data: updatedUser.profile
  });
}));

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Not authorized
 */
router.delete('/:id', [
  protect,
  authorize('admin')
], asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent admin from deleting themselves
  if (req.user._id.toString() === user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account'
    });
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
}));

/**
 * @swagger
 * /api/users/profile/update:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *               email:
 *                 type: string
 *                 format: email
 *               avatar:
 *                 type: string
 *                 description: Avatar URL or base64 image
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/profile/update', [
  protect,
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('avatar')
    .optional()
    .isString()
    .withMessage('Avatar must be a string')
], validateRequest, asyncHandler(async (req, res) => {
  const { name, email, avatar } = req.body;

  // Check if email is already taken
  if (email && email !== req.user.email) {
    const emailExists = await User.findOne({ 
      email,
      _id: { $ne: req.user._id }
    });
    
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email is already in use'
      });
    }
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        ...(name && { name }),
        ...(email && { email }),
        ...(avatar !== undefined && { avatar })
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    data: updatedUser.profile
  });
}));

/**
 * @swagger
 * /api/users/password/change:
 *   put:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.put('/password/change', [
  protect,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
], validateRequest, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  if (!(await user.comparePassword(currentPassword))) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
}));

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
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
 *                     totalUsers:
 *                       type: integer
 *                     verifiedUsers:
 *                       type: integer
 *                     adminUsers:
 *                       type: integer
 *                     recentUsers:
 *                       type: integer
 */
router.get('/stats', [
  protect,
  authorize('admin')
], asyncHandler(async (req, res) => {
  const [totalUsers, verifiedUsers, adminUsers, recentUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isVerified: true }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ 
      createdAt: { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      } 
    })
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      verifiedUsers,
      adminUsers,
      recentUsers
    }
  });
}));

export default router;