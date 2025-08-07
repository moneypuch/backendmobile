import mongoose from 'mongoose';
import Session from '../src/models/Session.js';
import { connectDB } from '../src/config/database.js';

/**
 * Migration script to add deviceType to existing sessions based on deviceName
 * Run with: node scripts/migrate-device-types.js
 */
async function migrateDeviceTypes() {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');

    // Get all sessions without deviceType
    const sessionsToUpdate = await Session.find({ 
      deviceType: { $exists: false } 
    });
    
    console.log(`Found ${sessionsToUpdate.length} sessions to update`);

    let hc05Count = 0;
    let imuCount = 0;
    let unknownCount = 0;

    // Update sessions based on deviceName patterns
    for (const session of sessionsToUpdate) {
      let deviceType = null;
      
      // Check for HC-05 patterns
      if (session.deviceName && (
        session.deviceName.toLowerCase().includes('hc-05') ||
        session.deviceName.toLowerCase().includes('hc05') ||
        session.deviceName.toLowerCase().includes('bluetooth')
      )) {
        deviceType = 'sEMG';
        hc05Count++;
      }
      // Check for IMU patterns
      else if (session.deviceName && (
        session.deviceName.toLowerCase().includes('imu') ||
        session.deviceName.toLowerCase().includes('inertial')
      )) {
        deviceType = 'IMU';
        imuCount++;
      } else {
        unknownCount++;
      }

      // Update session with deviceType
      session.deviceType = deviceType;
      await session.save();
      
      console.log(`Updated session ${session.sessionId}: deviceName="${session.deviceName}" -> deviceType="${deviceType}"`);
    }

    console.log('\nMigration Summary:');
    console.log(`- sEMG devices: ${hc05Count}`);
    console.log(`- IMU devices: ${imuCount}`);
    console.log(`- Unknown devices (set to null): ${unknownCount}`);
    console.log(`- Total sessions updated: ${sessionsToUpdate.length}`);

    // Verify the update
    const verifyCount = await Session.countDocuments({ 
      deviceType: { $exists: true } 
    });
    console.log(`\nVerification: ${verifyCount} sessions now have deviceType field`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    // Disconnect from database
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

// Run migration
migrateDeviceTypes();