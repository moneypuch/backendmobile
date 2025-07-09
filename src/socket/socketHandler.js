import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import User from '../models/User.js';

export const setupSocketIO = (io) => {
  // Middleware for socket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (token) {
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id);
        
        if (user) {
          socket.user = user;
        }
      }
      
      next();
    } catch (error) {
      console.log('Socket authentication failed:', error.message);
      next(); // Allow connection even without auth for public features
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    if (socket.user) {
      console.log(`👤 Authenticated user: ${socket.user.email}`);
      socket.join(`user_${socket.user._id}`);
    }

    // Handle custom events
    socket.on('join_room', (room) => {
      socket.join(room);
      socket.emit('joined_room', room);
    });

    socket.on('leave_room', (room) => {
      socket.leave(room);
      socket.emit('left_room', room);
    });

    socket.on('send_message', (data) => {
      if (socket.user) {
        const message = {
          ...data,
          user: socket.user.profile,
          timestamp: new Date()
        };
        
        // Broadcast to room or specific user
        if (data.room) {
          socket.to(data.room).emit('new_message', message);
        } else if (data.to) {
          socket.to(`user_${data.to}`).emit('new_message', message);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  // Utility function to send notification to specific user
  const sendToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
  };

  // Utility function to broadcast to all connected clients
  const broadcast = (event, data) => {
    io.emit(event, data);
  };

  return { sendToUser, broadcast };
};