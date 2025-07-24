import mongoose from 'mongoose';
import { config } from './env.js';
import { createIndexes } from './indexes.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      // Modern MongoDB connection options
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Create indexes for optimal performance
    await createIndexes();

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};