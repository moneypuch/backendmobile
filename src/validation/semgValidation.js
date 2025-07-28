import { body, query, param } from 'express-validator';

// Validation for batch upload endpoint
export const validateBatchUpload = [
  body('sessionId')
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Session ID must be a string between 10-100 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Session ID can only contain alphanumeric characters, underscores, and hyphens'),
  
  body('samples')
    .isArray({ min: 1, max: 5000 })
    .withMessage('Samples must be an array with 1-5000 items'),
  
  body('samples.*.timestamp')
    .isNumeric()
    .custom(value => {
      const timestamp = Number(value);
      if (timestamp <= 0) {
        throw new Error('Timestamp must be a positive number');
      }
      // Check if timestamp is reasonable (not too far in past or future)
      const now = Date.now();
      const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
      const oneYearFromNow = now + (365 * 24 * 60 * 60 * 1000);
      
      if (timestamp < oneYearAgo || timestamp > oneYearFromNow) {
        throw new Error('Timestamp appears to be invalid (too far in past or future)');
      }
      return true;
    }),
  
  body('samples.*.values')
    .isArray({ min: 10, max: 10 })
    .withMessage('Each sample must have exactly 10 channel values'),
  
  body('samples.*.values.*')
    .isNumeric()
    .custom(value => {
      const numValue = Number(value);
      if (!isFinite(numValue)) {
        throw new Error('Channel values must be finite numbers');
      }
      // Check for reasonable EMG signal range (adjust based on your sensor specs)
      if (numValue < -10000 || numValue > 10000) {
        throw new Error('Channel values appear to be out of reasonable range');
      }
      return true;
    }),
  
  body('samples.*.sessionId')
    .isString()
    .custom((value, { req }) => {
      if (value !== req.body.sessionId) {
        throw new Error('Sample sessionId must match batch sessionId');
      }
      return true;
    }),
  
  body('deviceInfo.name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Device name is required and must be under 100 characters')
    .trim(),
  
  body('deviceInfo.address')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Device address is required and must be under 50 characters')
    .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    .withMessage('Device address must be a valid MAC address format'),
  
  body('batchInfo.size')
    .isInt({ min: 1, max: 5000 })
    .withMessage('Batch size must be between 1-5000')
    .custom((value, { req }) => {
      if (req.body.samples && value !== req.body.samples.length) {
        throw new Error('Batch size must match actual samples array length');
      }
      return true;
    }),
  
  body('batchInfo.startTime')
    .isNumeric()
    .custom((value, { req }) => {
      const startTime = Number(value);
      if (startTime <= 0) {
        throw new Error('Start time must be a positive number');
      }
      
      // Validate that first sample timestamp matches start time
      if (req.body.samples && req.body.samples.length > 0) {
        const firstSampleTime = Number(req.body.samples[0].timestamp);
        if (Math.abs(firstSampleTime - startTime) > 10) { // Allow 10ms tolerance
          throw new Error('First sample timestamp should match batch start time');
        }
      }
      return true;
    }),
  
  body('batchInfo.endTime')
    .isNumeric()
    .custom((value, { req }) => {
      const endTime = Number(value);
      const startTime = Number(req.body.batchInfo?.startTime);
      
      if (endTime <= 0) {
        throw new Error('End time must be a positive number');
      }
      
      if (startTime && endTime <= startTime) {
        throw new Error('End time must be after start time');
      }
      
      // Validate that last sample timestamp is close to end time
      if (req.body.samples && req.body.samples.length > 0) {
        const lastSampleTime = Number(req.body.samples[req.body.samples.length - 1].timestamp);
        if (Math.abs(lastSampleTime - endTime) > 10) { // Allow 10ms tolerance
          throw new Error('Last sample timestamp should be close to batch end time');
        }
      }
      
      return true;
    })
];

// Validation for session data retrieval
export const validateSessionDataQuery = [
  param('sessionId')
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Session ID must be a string between 10-100 characters'),
  
  query('startTime')
    .optional()
    .isNumeric()
    .custom(value => {
      const timestamp = Number(value);
      if (timestamp <= 0) {
        throw new Error('Start time must be a positive number');
      }
      return true;
    }),
  
  query('endTime')
    .optional()
    .isNumeric()
    .custom((value, { req }) => {
      const endTime = Number(value);
      const startTime = Number(req.query.startTime);
      
      if (endTime <= 0) {
        throw new Error('End time must be a positive number');
      }
      
      if (startTime && endTime <= startTime) {
        throw new Error('End time must be after start time');
      }
      
      return true;
    }),
  
  query('channels')
    .optional()
    .custom(value => {
      if (typeof value !== 'string') {
        throw new Error('Channels must be a comma-separated string');
      }
      
      const channels = value.split(',').map(ch => ch.trim());
      const validChannels = channels.every(ch => {
        const chNum = parseInt(ch);
        return !isNaN(chNum) && chNum >= 0 && chNum <= 9;
      });
      
      if (!validChannels) {
        throw new Error('Channels must be comma-separated numbers between 0-9');
      }
      
      // Check for duplicates
      const uniqueChannels = [...new Set(channels)];
      if (uniqueChannels.length !== channels.length) {
        throw new Error('Duplicate channels are not allowed');
      }
      
      return true;
    }),
  
  query('maxPoints')
    .optional()
    .isInt({ min: 100, max: 100000 })
    .withMessage('Max points must be between 100-100000')
];

// Validation for session statistics
export const validateSessionStats = [
  param('sessionId')
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Session ID must be a string between 10-100 characters')
];

// Custom validation middleware for complex batch data integrity
export const validateBatchIntegrity = (req, res, next) => {
  const { samples, batchInfo } = req.body;
  
  if (!samples || !batchInfo) {
    return next();
  }
  
  try {
    // Check timestamp sequence
    let prevTimestamp = 0;
    const timestampGaps = [];
    
    samples.forEach((sample, index) => {
      const timestamp = Number(sample.timestamp);
      
      if (index > 0) {
        const gap = timestamp - prevTimestamp;
        timestampGaps.push(gap);
        
        // Check for reasonable gaps (assuming 1000Hz sample rate, expect ~1ms gaps)
        if (gap < 0) {
          throw new Error(`Sample ${index}: Timestamp goes backwards`);
        }
        if (gap > 10) { // Allow up to 10ms gap
          throw new Error(`Sample ${index}: Timestamp gap too large (${gap}ms)`);
        }
      }
      
      prevTimestamp = timestamp;
    });
    
    // Check for consistent sampling rate
    if (timestampGaps.length > 0) {
      const avgGap = timestampGaps.reduce((sum, gap) => sum + gap, 0) / timestampGaps.length;
      const expectedGap = 1000 / batchInfo.expectedSampleRate || 1; // Default to 1ms for 1000Hz
      
      if (Math.abs(avgGap - expectedGap) > 0.5) {
        console.warn(`Average timestamp gap (${avgGap}ms) differs from expected (${expectedGap}ms)`);
      }
    }
    
    // Check for signal anomalies (basic outlier detection)
    for (let channelIdx = 0; channelIdx < 10; channelIdx++) {
      const channelValues = samples.map(sample => Number(sample.values[channelIdx]));
      const mean = channelValues.reduce((sum, val) => sum + val, 0) / channelValues.length;
      const stdDev = Math.sqrt(
        channelValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / channelValues.length
      );
      
      // Flag values more than 5 standard deviations from mean
      const outliers = channelValues.filter(val => Math.abs(val - mean) > 5 * stdDev);
      if (outliers.length > channelValues.length * 0.05) { // More than 5% outliers
        console.warn(`Channel ${channelIdx}: High number of outliers detected (${outliers.length}/${channelValues.length})`);
      }
    }
    
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Batch integrity validation failed',
      error: error.message
    });
  }
};

// Export validation chains for easy use
export const batchValidation = {
  upload: validateBatchUpload,
  integrity: validateBatchIntegrity
};

export const sessionValidation = {
  dataQuery: validateSessionDataQuery,
  stats: validateSessionStats
};