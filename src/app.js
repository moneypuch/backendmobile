import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';

import { connectDB } from './config/database.js';
import { swaggerOptions } from './config/swagger.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import semgRoutes from './routes/semg.js';
import sessionRoutes from './routes/sessions.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupSocketIO } from './socket/socketHandler.js';
import './config/env.js';

const app = express();

// Trust proxy for ngrok and other reverse proxies
app.set('trust proxy', 1);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? true : process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key', 'X-Device-ID', 'X-App-Version', 'X-Platform']
}));
app.use(compression());

// Rate limiting - only in production
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // increased limit for high-frequency sEMG data (1000Hz sampling)
    message: 'Too many requests from this IP, please try again later.',
    trustProxy: true,
    keyGenerator: (req) => req.ip
  });
  app.use(limiter);
} else {
  console.log('⚠️  Rate limiting disabled in non-production environment');
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
const specs = swaggerJSDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/semg', semgRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);

app.get('/swagger-export', (req, res) => {
  res.json(specs); // or whatever your swagger object is called
});

// Socket.IO setup
setupSocketIO(io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log('Route:', r.route.path)
  }
})

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
});

export default app;