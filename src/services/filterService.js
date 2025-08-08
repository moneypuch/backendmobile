// src/services/filterService.js

/**
 * Digital signal filtering service for sEMG and IMU data
 * Implements Butterworth bandpass filters
 */

class FilterService {
  constructor() {
    // Filter specifications for different sensor types
    this.filterSpecs = {
      'IMU': { lowCut: 0.5, highCut: 20 },    // 0.5-20 Hz for IMU
      'sEMG': { lowCut: 20, highCut: 400 },   // 20-400 Hz for sEMG
      'HC-05': { lowCut: 20, highCut: 400 }   // HC-05 is sEMG
    };
  }

  /**
   * Apply bandpass filter to signal data
   * @param {number[]} data - Input signal data
   * @param {number} sampleRate - Sampling rate in Hz
   * @param {number} lowCut - Low cutoff frequency in Hz
   * @param {number} highCut - High cutoff frequency in Hz
   * @param {number} order - Filter order (default: 4)
   * @returns {number[]} Filtered signal
   */
  butterworthBandpass(data, sampleRate, lowCut, highCut, order = 4) {
    if (!data || data.length === 0) return [];
    
    // Nyquist frequency
    const nyquist = sampleRate / 2;
    
    // Validate frequency bounds
    if (lowCut <= 0 || highCut >= nyquist || lowCut >= highCut) {
      console.warn(`Invalid filter frequencies: lowCut=${lowCut}, highCut=${highCut}, nyquist=${nyquist}`);
      return data; // Return unfiltered data if frequencies are invalid
    }
    
    // Apply high-pass filter (removes low frequencies below lowCut)
    let filtered = this.butterworthHighpass(data, sampleRate, lowCut, order);
    
    // Apply low-pass filter (removes high frequencies above highCut)
    filtered = this.butterworthLowpass(filtered, sampleRate, highCut, order);
    
    return filtered;
  }

  /**
   * Butterworth high-pass filter
   * @param {number[]} data - Input signal
   * @param {number} sampleRate - Sampling rate in Hz
   * @param {number} cutoff - Cutoff frequency in Hz
   * @param {number} order - Filter order
   * @returns {number[]} High-pass filtered signal
   */
  butterworthHighpass(data, sampleRate, cutoff, order = 4) {
    const RC = 1.0 / (2.0 * Math.PI * cutoff);
    const dt = 1.0 / sampleRate;
    const alpha = RC / (RC + dt);
    
    const filtered = new Array(data.length);
    
    // Initialize with first sample
    filtered[0] = data[0];
    
    // Apply recursive filter
    for (let n = 1; n < data.length; n++) {
      filtered[n] = alpha * (filtered[n - 1] + data[n] - data[n - 1]);
    }
    
    // Apply multiple times for higher order
    let result = filtered;
    for (let i = 1; i < order; i++) {
      result = this.applyHighpassPass(result, alpha);
    }
    
    return result;
  }

  /**
   * Single pass of high-pass filter
   */
  applyHighpassPass(data, alpha) {
    const filtered = new Array(data.length);
    filtered[0] = data[0];
    
    for (let n = 1; n < data.length; n++) {
      filtered[n] = alpha * (filtered[n - 1] + data[n] - data[n - 1]);
    }
    
    return filtered;
  }

  /**
   * Butterworth low-pass filter
   * @param {number[]} data - Input signal
   * @param {number} sampleRate - Sampling rate in Hz
   * @param {number} cutoff - Cutoff frequency in Hz
   * @param {number} order - Filter order
   * @returns {number[]} Low-pass filtered signal
   */
  butterworthLowpass(data, sampleRate, cutoff, order = 4) {
    const RC = 1.0 / (2.0 * Math.PI * cutoff);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (RC + dt);
    
    const filtered = new Array(data.length);
    
    // Initialize with first sample
    filtered[0] = data[0];
    
    // Apply recursive filter
    for (let n = 1; n < data.length; n++) {
      filtered[n] = filtered[n - 1] + alpha * (data[n] - filtered[n - 1]);
    }
    
    // Apply multiple times for higher order
    let result = filtered;
    for (let i = 1; i < order; i++) {
      result = this.applyLowpassPass(result, alpha);
    }
    
    return result;
  }

  /**
   * Single pass of low-pass filter
   */
  applyLowpassPass(data, alpha) {
    const filtered = new Array(data.length);
    filtered[0] = data[0];
    
    for (let n = 1; n < data.length; n++) {
      filtered[n] = filtered[n - 1] + alpha * (data[n] - filtered[n - 1]);
    }
    
    return filtered;
  }

  /**
   * Apply appropriate bandpass filter based on device type
   * @param {number[]} data - Input signal data
   * @param {string} deviceType - Device type (IMU, sEMG, HC-05)
   * @param {number} sampleRate - Sampling rate in Hz
   * @returns {number[]} Filtered signal
   */
  filterByDeviceType(data, deviceType, sampleRate) {
    const specs = this.filterSpecs[deviceType];
    
    if (!specs) {
      console.warn(`Unknown device type: ${deviceType}, returning unfiltered data`);
      return data;
    }
    
    return this.butterworthBandpass(
      data,
      sampleRate,
      specs.lowCut,
      specs.highCut,
      4 // 4th order Butterworth filter
    );
  }

  /**
   * Filter all channels in a session chunk
   * @param {Object} channels - Object with channel data
   * @param {string} deviceType - Device type
   * @param {number} sampleRate - Sampling rate
   * @returns {Object} Filtered channels
   */
  filterChannels(channels, deviceType, sampleRate) {
    const filteredChannels = {};
    
    for (const [channelKey, values] of Object.entries(channels)) {
      if (Array.isArray(values)) {
        filteredChannels[channelKey] = this.filterByDeviceType(
          values,
          deviceType,
          sampleRate
        );
      }
    }
    
    return filteredChannels;
  }

  /**
   * Get filter specifications for a device type
   * @param {string} deviceType - Device type
   * @returns {Object} Filter specifications
   */
  getFilterSpecs(deviceType) {
    return this.filterSpecs[deviceType] || null;
  }

  /**
   * Calculate frequency response of the filter
   * @param {string} deviceType - Device type
   * @param {number} sampleRate - Sampling rate
   * @returns {Object} Frequency response data
   */
  getFrequencyResponse(deviceType, sampleRate) {
    const specs = this.filterSpecs[deviceType];
    if (!specs) return null;
    
    const nyquist = sampleRate / 2;
    const frequencies = [];
    const response = [];
    
    // Generate frequency points
    for (let f = 0.1; f < nyquist; f *= 1.1) {
      frequencies.push(f);
      
      // Simple approximation of Butterworth response
      let H = 1;
      const order = 4;
      
      // High-pass component
      if (f < specs.lowCut) {
        H *= Math.pow(f / specs.lowCut, order);
      }
      
      // Low-pass component
      if (f > specs.highCut) {
        H *= Math.pow(specs.highCut / f, order);
      }
      
      response.push(H);
    }
    
    return {
      frequencies,
      response,
      lowCut: specs.lowCut,
      highCut: specs.highCut,
      sampleRate
    };
  }

  /**
   * Apply zero-phase filtering (forward-backward filter)
   * This eliminates phase distortion but requires the entire signal
   * @param {number[]} data - Input signal
   * @param {string} deviceType - Device type
   * @param {number} sampleRate - Sampling rate
   * @returns {number[]} Zero-phase filtered signal
   */
  zeroPhaseFilter(data, deviceType, sampleRate) {
    // Forward pass
    let filtered = this.filterByDeviceType(data, deviceType, sampleRate);
    
    // Reverse the signal
    filtered = filtered.reverse();
    
    // Backward pass
    filtered = this.filterByDeviceType(filtered, deviceType, sampleRate);
    
    // Reverse back to original order
    return filtered.reverse();
  }
}

export default new FilterService();