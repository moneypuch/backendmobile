# Claude Instructions: Express Backend for sEMG Data Management

## 🎯 Project Overview

Extend this Express.js backend with MongoDB for managing high-frequency sEMG (surface electromyography) data from React Native Bluetooth applications. The system handles 1000 samples/second × 10 channels streaming from HC-05 devices.

## 📋 Requirements

### Core Features
1. **Data Sync Endpoint**: Receive and store batched sEMG data from mobile app
2. **Session Management**: CRUD operations for recording sessions
3. **Data Retrieval**: Efficient querying of stored data by session/time range
4. **Statistics**: Pre-calculated channel statistics for performance
5. **User Management**: Multi-user support with data isolation

### Technical Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Validation**: Joi or express-validator
- **Authentication**: JWT (optional for multi-user)
- **Logging**: Winston or similar
- **Environment**: dotenv for configuration

## 🗄️ Database Schema

### Sessions Collection
```javascript
const sessionSchema = {
  _id: ObjectId,
  userId: ObjectId,          // User identifier
  sessionId: String,         // "session_1640995200000_user123"
  deviceId: String,          // "HC-05_ABC123"
  deviceName: String,        // "HC-05 Device" 
  startTime: Date,           // ISODate("2024-01-01T10:00:00Z")
  endTime: Date,             // ISODate("2024-01-01T10:15:00Z") - null if active
  sampleRate: Number,        // 1000 (samples per second)
  channelCount: Number,      // 10 (number of EMG channels)
  totalSamples: Number,      // Total samples recorded
  status: String,            // "active", "completed", "error"
  metadata: {
    appVersion: String,
    deviceInfo: Object,
    notes: String
  }
}
```

### Data Chunks Collection (1 second per document)
```javascript
const dataChunkSchema = {
  _id: ObjectId,
  sessionId: String,         // References session
  chunkIndex: Number,        // Sequential chunk number (0, 1, 2...)
  startTime: Date,           // Start time of this chunk
  endTime: Date,             // End time of this chunk
  sampleCount: Number,       // Number of samples in this chunk (usually 1000)
  data: {
    timestamps: [Number],    // [1640995200000, 1640995200001, ...] - 1000 entries
    channels: {
      ch0: [Number],         // [123.45, 124.67, ...] - 1000 values
      ch1: [Number],         // [234.56, 235.78, ...]
      ch2: [Number],
      ch3: [Number],
      ch4: [Number],
      ch5: [Number],
      ch6: [Number],
      ch7: [Number],
      ch8: [Number],
      ch9: [Number]
    }
  },
  stats: {                   // Pre-calculated statistics for performance
    ch0: {min: Number, max: Number, avg: Number, rms: Number},
    ch1: {min: Number, max: Number, avg: Number, rms: Number},
    // ... stats for all channels ch0-ch9
  }
}
```

## 🛠️ API Endpoints

### 1. Data Sync Endpoint
```
POST /api/semg/batch
Content-Type: application/json

Request Body:
{
  sessionId: "session_1640995200000_user123",
  samples: [
    {
      timestamp: 1640995200000,
      values: [123.45, 234.56, 345.67, 456.78, 567.89, 678.90, 789.01, 890.12, 901.23, 012.34],
      sessionId: "session_1640995200000_user123"
    },
    // ... up to 1000 samples
  ],
  deviceInfo: {
    name: "HC-05 Device",
    address: "98:D3:31:FB:4E:7C"
  },
  batchInfo: {
    size: 1000,
    startTime: 1640995200000,
    endTime: 1640995201000
  }
}

Response:
{
  success: true,
  chunkId: "chunk_id_here",
  samplesProcessed: 1000,
  sessionStatus: "active"
}
```

### 2. Session Management
```
GET /api/sessions?userId=user123&limit=50&offset=0
Response:
{
  success: true,
  sessions: [
    {
      sessionId: "session_1640995200000_user123",
      deviceName: "HC-05 Device",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T10:15:00Z",
      duration: 900, // seconds
      totalSamples: 900000,
      status: "completed"
    }
  ],
  total: 25,
  hasMore: false
}

GET /api/sessions/:sessionId
Response:
{
  success: true,
  session: {
    sessionId: "session_1640995200000_user123",
    userId: "user123",
    deviceId: "HC-05_ABC123",
    deviceName: "HC-05 Device",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T10:15:00Z",
    sampleRate: 1000,
    channelCount: 10,
    totalSamples: 900000,
    status: "completed",
    chunks: 900, // number of data chunks
    metadata: {
      appVersion: "1.0.0",
      deviceInfo: {...},
      notes: "Test session"
    }
  }
}

POST /api/sessions
Body:
{
  sessionId: "session_1640995200000_user123",
  userId: "user123",
  deviceId: "HC-05_ABC123",
  deviceName: "HC-05 Device",
  startTime: "2024-01-01T10:00:00Z"
}

PUT /api/sessions/:sessionId/end
Body:
{
  endTime: "2024-01-01T10:15:00Z",
  totalSamples: 900000
}
```

### 3. Data Retrieval
```
GET /api/sessions/:sessionId/data?startTime=1640995200000&endTime=1640995800000&channels=0,1,2&resolution=100Hz
Response:
{
  success: true,
  data: {
    sessionId: "session_1640995200000_user123",
    timeRange: [1640995200000, 1640995800000],
    resolution: "100Hz", // or "1kHz" based on time range
    channels: {
      ch0: [
        {timestamp: 1640995200000, value: 123.45},
        {timestamp: 1640995200010, value: 124.67},
        // ... decimated to 100Hz if needed
      ],
      ch1: [...],
      ch2: [...]
    },
    stats: {
      ch0: {min: 120.1, max: 130.5, avg: 125.2, rms: 125.8, count: 60000},
      ch1: {...},
      ch2: {...}
    }
  }
}

GET /api/sessions/:sessionId/stats
Response:
{
  success: true,
  stats: {
    session: {
      duration: 900,
      totalSamples: 900000,
      avgSampleRate: 1000.1,
      dataIntegrity: 99.98
    },
    channels: {
      ch0: {min: 120.1, max: 130.5, avg: 125.2, rms: 125.8, count: 900000},
      // ... stats for all channels
    }
  }
}
```

## 🏗️ Implementation Guidelines

### Project Structure
```

### Key Implementation Details

#### 1. Data Processing Service
```javascript
// src/services/dataProcessor.js
class DataProcessor {
  async processBatch(batchData) {
    // 1. Transform mobile app format to MongoDB format
    // 2. Calculate statistics for each channel
    // 3. Create data chunk document
    // 4. Update session metadata
    // 5. Handle data integrity checks
  }

  calculateChannelStats(values) {
    // Calculate min, max, avg, rms for channel data
    // Return: {min, max, avg, rms}
  }

  transformToChunkFormat(samples) {
    // Transform array of samples to chunk format:
    // [{timestamp, values: [ch0,ch1...ch9]}] 
    // -> {timestamps: [], channels: {ch0: [], ch1: []...}}
  }
}
```

#### 2. Query Optimizer
```javascript
// src/services/queryOptimizer.js
class QueryOptimizer {
  async getSessionData(sessionId, startTime, endTime, channels, maxPoints) {
    // 1. Determine optimal resolution based on time range
    // 2. Query relevant chunks efficiently
    // 3. Decimate data if needed to meet maxPoints limit
    // 4. Return optimized dataset
  }

  determineResolution(timeRangeMs, maxPoints) {
    // Auto-select 1kHz, 100Hz, or 10Hz based on time range
    // Ensure result doesn't exceed maxPoints
  }
}
```

#### 3. MongoDB Indexes
```javascript
// Essential indexes for performance
db.sessions.createIndex({userId: 1, startTime: -1})
db.sessions.createIndex({sessionId: 1}, {unique: true})
db.dataChunks.createIndex({sessionId: 1, chunkIndex: 1})
db.dataChunks.createIndex({sessionId: 1, startTime: 1, endTime: 1})
```

#### 4. Data Validation
```javascript
// Validate incoming batch data
const batchValidation = {
  sessionId: Joi.string().required(),
  samples: Joi.array().items({
    timestamp: Joi.number().positive().required(),
    values: Joi.array().length(10).items(Joi.number()).required(),
    sessionId: Joi.string().required()
  }).min(1).max(1000).required(),
  deviceInfo: Joi.object({
    name: Joi.string().required(),
    address: Joi.string().required()
  }).required(),
  batchInfo: Joi.object({
    size: Joi.number().positive().required(),
    startTime: Joi.number().positive().required(),
    endTime: Joi.number().positive().required()
  }).required()
}
```

## ⚡ Performance Optimizations

### 1. Database
- Use MongoDB compound indexes for efficient queries
- Implement data chunk sharding for large datasets
- Use aggregation pipelines for complex statistics
- Enable MongoDB compression for storage efficiency

### 2. API
- Implement response compression (gzip)
- Use connection pooling for MongoDB
- Add rate limiting for data sync endpoints
- Implement caching for frequently accessed sessions

### 3. Data Processing
- Stream processing for large batch uploads
- Parallel processing for statistics calculations
- Efficient memory management for large datasets

## 🚀 Deployment Configuration

### Environment Variables


### Docker Support
Create Dockerfile and docker-compose.yml for easy deployment with MongoDB.

## 🧪 Testing Requirements

### Unit Tests
- Data transformation functions
- Statistics calculations
- Validation middleware

### Integration Tests
- API endpoint testing
- Database operations
- Error handling scenarios

### Performance Tests
- Batch data upload under load
- Concurrent session queries
- Memory usage monitoring

## 📊 Monitoring & Logging

### Metrics to Track
- Data throughput (samples/second)
- API response times
- Database query performance
- Memory and CPU usage
- Error rates and types

### Logging Strategy
- Structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Request/response logging for API calls
- Database operation logging

## 🔒 Security Considerations

### Data Protection
- Input validation on all endpoints
- SQL injection prevention (using Mongoose)
- Rate limiting on data sync endpoints
- Optional JWT authentication for multi-user setups

### Access Control
- User-based data isolation
- Session-based access controls
- API key authentication (optional)

---

## 📝 Next Steps

1. **Initialize Project**: Read project Structures and update missing libraries
2. **Setup Database**: Configure MongoDB with proper schemas and indexes
3. **Implement Core APIs**: Start with data sync endpoint and session management
4. **Add Data Retrieval**: Implement efficient querying with optimization
5. **Testing**: Add comprehensive test coverage
6. **Documentation**: Create API documentation with examples

This backend will provide a robust, scalable foundation for managing high-frequency sEMG data from your React Native Bluetooth application.