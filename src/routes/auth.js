import express from 'express';
import { body } from 'express-validator';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: password123
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], validateRequest, asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password
  });

  // Generate token
  const token = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken();

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(201).json({
    success: true,
    token,
    refreshToken,
    user: user.profile
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], validateRequest, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Update last login
  await user.updateLastLogin();

  // Generate tokens
  const token = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken();

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    token,
    refreshToken,
    user: user.profile
  });
}));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 */
router.get('/me', protect, asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user.profile
  });
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', protect, asyncHandler(async (req, res) => {
  // Clear refresh token
  req.user.refreshToken = undefined;
  await req.user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token is required'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwtSecret + 'refresh');
    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const newToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    // Update refresh token
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
}));

export default router;