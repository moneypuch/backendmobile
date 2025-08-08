// src/services/normalizationService.js

/**
 * Signal normalization service for sEMG and IMU data
 * Provides various normalization methods that can be applied to multi-channel time series data
 */

class NormalizationService {
  /**
   * Min-Max normalization (scales data to [0, 1] range)
   * @param {number[]} data - Array of values to normalize
   * @param {Object} options - Normalization options
   * @returns {number[]} Normalized data
   */
  minMaxNormalize(data, options = {}) {
    const { featureRange = [0, 1] } = options;
    
    if (!data || data.length === 0) return [];
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    
    // Handle case where all values are the same
    if (max === min) {
      return data.map(() => featureRange[0]);
    }
    
    const scale = featureRange[1] - featureRange[0];
    
    return data.map(value => {
      const normalized = (value - min) / (max - min);
      return normalized * scale + featureRange[0];
    });
  }

  /**
   * Z-Score normalization (standardization)
   * @param {number[]} data - Array of values to normalize
   * @returns {number[]} Normalized data with mean=0 and std=1
   */
  zScoreNormalize(data) {
    if (!data || data.length === 0) return [];
    
    const mean = this.calculateMean(data);
    const std = this.calculateStandardDeviation(data, mean);
    
    // Handle case where standard deviation is 0
    if (std === 0) {
      return data.map(() => 0);
    }
    
    return data.map(value => (value - mean) / std);
  }

  /**
   * RMS (Root Mean Square) normalization
   * @param {number[]} data - Array of values to normalize
   * @returns {number[]} Normalized data
   */
  rmsNormalize(data) {
    if (!data || data.length === 0) return [];
    
    const rms = Math.sqrt(
      data.reduce((sum, value) => sum + value * value, 0) / data.length
    );
    
    // Handle case where RMS is 0
    if (rms === 0) {
      return data.map(() => 0);
    }
    
    return data.map(value => value / rms);
  }

  /**
   * Maximum absolute value normalization
   * @param {number[]} data - Array of values to normalize
   * @returns {number[]} Normalized data in range [-1, 1]
   */
  maxAbsNormalize(data) {
    if (!data || data.length === 0) return [];
    
    const maxAbs = Math.max(...data.map(Math.abs));
    
    // Handle case where max absolute value is 0
    if (maxAbs === 0) {
      return data.map(() => 0);
    }
    
    return data.map(value => value / maxAbs);
  }

  /**
   * Percentile normalization (robust to outliers)
   * @param {number[]} data - Array of values to normalize
   * @param {Object} options - Normalization options
   * @returns {number[]} Normalized data
   */
  percentileNormalize(data, options = {}) {
    const { lowerPercentile = 5, upperPercentile = 95 } = options;
    
    if (!data || data.length === 0) return [];
    
    const sorted = [...data].sort((a, b) => a - b);
    const lowerIdx = Math.floor(sorted.length * lowerPercentile / 100);
    const upperIdx = Math.ceil(sorted.length * upperPercentile / 100) - 1;
    
    const pLower = sorted[lowerIdx];
    const pUpper = sorted[upperIdx];
    
    // Handle case where percentiles are the same
    if (pUpper === pLower) {
      return data.map(() => 0);
    }
    
    return data.map(value => {
      const normalized = (value - pLower) / (pUpper - pLower);
      // Clip to [0, 1] range
      return Math.max(0, Math.min(1, normalized));
    });
  }

  /**
   * Normalize multi-channel data with optional filtering
   * @param {Object} channelData - Object with channel keys and arrays of {timestamp, value}
   * @param {string} method - Normalization method
   * @param {Object} options - Method-specific options
   * @param {Object} filterOptions - Filter options {deviceType, sampleRate}
   * @returns {Object} Normalized channel data
   */
  async normalizeChannels(channelData, method = 'min_max', options = {}, filterOptions = null) {
    const normalizedChannels = {};
    
    // Import filter service if filtering is requested
    let filterService = null;
    if (filterOptions && filterOptions.deviceType && filterOptions.sampleRate) {
      filterService = (await import('./filterService.js')).default;
    }
    
    for (const [channelKey, channelSamples] of Object.entries(channelData)) {
      if (!Array.isArray(channelSamples)) continue;
      
      // Extract values from samples
      let values = channelSamples.map(sample => sample.value);
      
      // Apply bandpass filter if requested
      if (filterService) {
        values = filterService.filterByDeviceType(
          values,
          filterOptions.deviceType,
          filterOptions.sampleRate
        );
      }
      
      // Apply normalization based on method
      let normalizedValues;
      switch (method) {
        case 'min_max':
          normalizedValues = this.minMaxNormalize(values, options);
          break;
        case 'z_score':
          normalizedValues = this.zScoreNormalize(values);
          break;
        case 'rms':
          normalizedValues = this.rmsNormalize(values);
          break;
        case 'max_abs':
          normalizedValues = this.maxAbsNormalize(values);
          break;
        case 'percentile':
          normalizedValues = this.percentileNormalize(values, options);
          break;
        default:
          // Default to min-max if method not recognized
          normalizedValues = this.minMaxNormalize(values);
      }
      
      // Reconstruct samples with normalized values
      normalizedChannels[channelKey] = channelSamples.map((sample, idx) => ({
        timestamp: sample.timestamp,
        value: normalizedValues[idx]
      }));
    }
    
    return normalizedChannels;
  }

  /**
   * Calculate statistics for normalized data
   * @param {Object} channelData - Normalized channel data
   * @returns {Object} Statistics for each channel
   */
  calculateNormalizedStats(channelData) {
    const stats = {};
    
    for (const [channelKey, channelSamples] of Object.entries(channelData)) {
      if (!Array.isArray(channelSamples)) continue;
      
      const values = channelSamples.map(sample => sample.value);
      const mean = this.calculateMean(values);
      
      stats[channelKey] = {
        min: Math.min(...values),
        max: Math.max(...values),
        mean: mean,
        avg: mean, // DataChunk model requires 'avg' field
        std: this.calculateStandardDeviation(values, mean),
        rms: Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length),
        count: values.length
      };
    }
    
    return stats;
  }

  // Helper methods
  calculateMean(data) {
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, value) => sum + value, 0) / data.length;
  }

  calculateStandardDeviation(data, mean = null) {
    if (!data || data.length === 0) return 0;
    
    const m = mean !== null ? mean : this.calculateMean(data);
    const variance = data.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / data.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Get method description
   * @param {string} method - Normalization method name
   * @returns {string} Description of the method
   */
  getMethodDescription(method) {
    const descriptions = {
      'min_max': 'Min-Max normalization: Scales data to [0, 1] range',
      'z_score': 'Z-Score normalization: Standardizes data (mean=0, std=1)',
      'rms': 'RMS normalization: Divides by root mean square',
      'max_abs': 'Max absolute normalization: Scales to [-1, 1] range',
      'percentile': 'Percentile normalization: Robust to outliers, scales to [0, 1]'
    };
    
    return descriptions[method] || 'Unknown normalization method';
  }

  /**
   * Validate normalization method
   * @param {string} method - Method name to validate
   * @returns {boolean} True if method is valid
   */
  isValidMethod(method) {
    const validMethods = ['min_max', 'z_score', 'rms', 'max_abs', 'percentile'];
    return validMethods.includes(method);
  }
}

export default new NormalizationService();