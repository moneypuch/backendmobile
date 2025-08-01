import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { connectDB } from '../src/config/database.js';

/**
 * Script to make a user an admin
 * Run with: node scripts/make-admin.js admin@example.com
 */
async function makeAdmin() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.log('Usage: node scripts/make-admin.js <email>');
      process.exit(1);
    }

    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');

    // Find and update user
    const user = await User.findOneAndUpdate(
      { email },
      { role: 'admin' },
      { new: true }
    );

    if (!user) {
      console.log(`User with email ${email} not found`);
      process.exit(1);
    }

    console.log(`Successfully made ${user.name} (${user.email}) an admin`);
    
  } catch (error) {
    console.error('Error making user admin:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

makeAdmin();