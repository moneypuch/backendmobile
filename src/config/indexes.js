import mongoose from 'mongoose';

/**
 * Create MongoDB indexes for optimal performance
 * This should be run once during application setup
 */
export const createIndexes = async () => {
  try {
    console.log('🔍 Creating MongoDB indexes...');
    
    const db = mongoose.connection.db;
    
    // Sessions collection indexes
    const sessionsCollection = db.collection('sessions');
    
    // Primary query patterns for sessions
    await sessionsCollection.createIndex({ userId: 1, startTime: -1 });
    await sessionsCollection.createIndex({ sessionId: 1 }, { unique: true });
    await sessionsCollection.createIndex({ sessionId: 1, userId: 1 });
    await sessionsCollection.createIndex({ status: 1, startTime: -1 });
    await sessionsCollection.createIndex({ userId: 1, status: 1, startTime: -1 });
    await sessionsCollection.createIndex({ deviceId: 1, startTime: -1 });
    await sessionsCollection.createIndex({ userId: 1, deviceId: 1, startTime: -1 });
    
    console.log('✅ Sessions indexes created');
    
    // DataChunks collection indexes
    const dataChunksCollection = db.collection('datachunks');
    
    // Primary query patterns for data chunks
    await dataChunksCollection.createIndex({ sessionId: 1, chunkIndex: 1 }, { unique: true });
    await dataChunksCollection.createIndex({ sessionId: 1, startTime: 1, endTime: 1 });
    await dataChunksCollection.createIndex({ sessionId: 1, startTime: 1 });
    await dataChunksCollection.createIndex({ sessionId: 1, endTime: 1 });
    
    // For time range queries
    await dataChunksCollection.createIndex({ 
      sessionId: 1, 
      startTime: 1 
    });
    
    // For aggregation queries (statistics)
    await dataChunksCollection.createIndex({ sessionId: 1 });
    
    console.log('✅ DataChunks indexes created');
    
    // Users collection additional indexes (if needed)
    const usersCollection = db.collection('users');
    
    // Email lookup (likely already exists from User model)
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    
    // For user activity queries
    await usersCollection.createIndex({ lastLogin: -1 });
    await usersCollection.createIndex({ createdAt: -1 });
    
    console.log('✅ Users indexes verified/created');
    
    // Create compound indexes for complex queries
    
    // For session listing with filters
    await sessionsCollection.createIndex({ 
      userId: 1, 
      status: 1, 
      deviceId: 1, 
      startTime: -1 
    });
    
    // For data chunk time range queries with sessionId
    await dataChunksCollection.createIndex({
      sessionId: 1,
      startTime: 1,
      endTime: 1,
      chunkIndex: 1
    });
    
    console.log('✅ Compound indexes created');
    
    // Text search indexes (if needed for session notes/metadata)
    try {
      await sessionsCollection.createIndex({ 
        'metadata.notes': 'text',
        deviceName: 'text'
      });
      console.log('✅ Text search indexes created');
    } catch (error) {
      // Text indexes might already exist or not be needed
      console.log('⚠️ Text search indexes skipped:', error.message);
    }
    
    // Create TTL index for old sessions if auto-cleanup is desired
    // Uncomment the following lines if you want sessions to auto-delete after a certain time
    /*
    await sessionsCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 365 * 24 * 60 * 60 } // 1 year
    );
    console.log('✅ TTL index created for sessions');
    */
    
    console.log('🎉 All MongoDB indexes created successfully!');
    
    // Display index information
    const sessionIndexes = await sessionsCollection.indexes();
    const dataChunkIndexes = await dataChunksCollection.indexes();
    
    console.log(`📊 Sessions collection has ${sessionIndexes.length} indexes`);
    console.log(`📊 DataChunks collection has ${dataChunkIndexes.length} indexes`);
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
};

/**
 * Drop all custom indexes (useful for development/testing)
 * BE CAREFUL - this will impact performance
 */
export const dropIndexes = async () => {
  try {
    console.log('🗑️ Dropping custom indexes...');
    
    const db = mongoose.connection.db;
    
    // Drop all indexes except _id (which can't be dropped)
    await db.collection('sessions').dropIndexes();
    await db.collection('datachunks').dropIndexes();
    
    console.log('✅ Custom indexes dropped');
  } catch (error) {
    console.error('❌ Error dropping indexes:', error);
    throw error;
  }
};

/**
 * Get index information for all collections
 */
export const getIndexInfo = async () => {
  try {
    const db = mongoose.connection.db;
    
    const collections = ['sessions', 'datachunks', 'users'];
    const indexInfo = {};
    
    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const indexes = await collection.indexes();
      const stats = await collection.stats();
      
      indexInfo[collectionName] = {
        indexes: indexes.map(index => ({
          name: index.name,
          key: index.key,
          unique: index.unique || false,
          sparse: index.sparse || false,
          expireAfterSeconds: index.expireAfterSeconds
        })),
        indexCount: indexes.length,
        documentCount: stats.count,
        averageDocumentSize: stats.avgObjSize,
        totalIndexSize: stats.totalIndexSize
      };
    }
    
    return indexInfo;
  } catch (error) {
    console.error('❌ Error getting index info:', error);
    throw error;
  }
};

/**
 * Analyze query performance for common patterns
 */
export const analyzeQueryPerformance = async () => {
  try {
    console.log('🔍 Analyzing query performance...');
    
    const db = mongoose.connection.db;
    
    // Test common query patterns
    const testQueries = [
      {
        name: 'User sessions by date',
        collection: 'sessions',
        query: { userId: new mongoose.Types.ObjectId() },
        sort: { startTime: -1 }
      },
      {
        name: 'Session by sessionId',
        collection: 'sessions',
        query: { sessionId: 'test_session_id' }
      },
      {
        name: 'Data chunks for session',
        collection: 'datachunks',
        query: { sessionId: 'test_session_id' },
        sort: { chunkIndex: 1 }
      },
      {
        name: 'Data chunks time range',
        collection: 'datachunks',
        query: {
          sessionId: 'test_session_id',
          startTime: { $gte: new Date('2024-01-01') },
          endTime: { $lte: new Date('2024-01-02') }
        }
      }
    ];
    
    const results = [];
    
    for (const test of testQueries) {
      const collection = db.collection(test.collection);
      
      // Explain the query
      const explanation = await collection
        .find(test.query)
        .sort(test.sort || {})
        .explain('executionStats');
      
      results.push({
        name: test.name,
        collection: test.collection,
        executionTimeMS: explanation.executionStats.executionTimeMillis,
        totalDocsExamined: explanation.executionStats.totalDocsExamined,
        totalDocsReturned: explanation.executionStats.totalDocsReturned,
        indexUsed: explanation.executionStats.executionStages?.indexName || 'COLLSCAN',
        efficient: explanation.executionStats.totalDocsExamined === explanation.executionStats.totalDocsReturned
      });
    }
    
    console.log('📈 Query Performance Results:');
    results.forEach(result => {
      console.log(`  ${result.name}:`);
      console.log(`    Time: ${result.executionTimeMS}ms`);
      console.log(`    Index: ${result.indexUsed}`);
      console.log(`    Efficient: ${result.efficient ? '✅' : '❌'}`);
    });
    
    return results;
  } catch (error) {
    console.error('❌ Error analyzing performance:', error);
    throw error;
  }
};