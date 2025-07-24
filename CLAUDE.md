# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern Express.js API backend designed for high-frequency sEMG (surface electromyography) data management from React Native Bluetooth applications. The system handles 1000 samples/second × 10 channels streaming from HC-05 devices and is built with MongoDB, JWT authentication, WebSocket support, and Swagger documentation.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with nodemon hot reload
npm start            # Production server
npm test             # Run Jest tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Check code style with ESLint
npm run lint:fix     # Fix ESLint issues automatically
```

## Environment Setup

The application requires a `.env` file in the root directory. Required environment variables:
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_EXPIRE` - JWT expiration time (default: 7d)
- `CLIENT_URL` - CORS allowed origin

MongoDB can be started with: `docker-compose up -d`

## Architecture Overview

### Core Structure
- **src/app.js** - Main Express application with middleware setup, route mounting, and server initialization
- **src/config/** - Configuration modules (database, environment, Swagger)
- **src/middleware/** - Custom middleware (authentication, error handling, validation)
- **src/models/** - Mongoose data models 
- **src/routes/** - API route handlers organized by feature
- **src/socket/** - WebSocket implementation using Socket.IO

### Key Architectural Patterns

**ES6 Modules**: The project uses ES6 import/export syntax throughout (`"type": "module"` in package.json)

**Async/Await with Error Handling**: Uses `express-async-handler` wrapper for consistent async error handling in route handlers

**JWT Authentication**: Implements Bearer token authentication with refresh token support. Authentication middleware (`protect`) extracts user from JWT and attaches to `req.user`

**Mongoose ODM**: MongoDB integration with schema validation, indexing, and pre/post hooks for password hashing

**Socket.IO Integration**: WebSocket server runs alongside Express with optional JWT authentication for real-time features

**Swagger Documentation**: Auto-generated API docs from JSDoc comments at `/api-docs`

### Database Design

The codebase currently has basic User model but is designed to extend for sEMG data management with:
- **Sessions Collection** - Recording session metadata
- **Data Chunks Collection** - Time-series data stored in 1-second chunks with pre-calculated statistics

### Security & Middleware Stack

- **helmet** - Security headers
- **cors** - Cross-origin resource sharing with configurable origins
- **express-rate-limit** - Rate limiting (100 requests/15 minutes)
- **compression** - Response compression
- **express-validator** - Input validation and sanitization
- **bcryptjs** - Password hashing with salt rounds of 12

### API Patterns

Routes follow RESTful conventions with consistent response format:
```json
{
  "success": boolean,
  "data": object,
  "message": string
}
```

Authentication endpoints (`/api/auth`) provide JWT tokens and refresh tokens. Protected routes require `Authorization: Bearer <token>` header.

### Socket.IO Features

Real-time communication supports:
- Optional JWT authentication for sockets
- Room-based messaging
- User-specific channels (`user_${userId}`)
- Message broadcasting utilities

## Development Notes

- MongoDB connection includes proper error handling and graceful shutdown
- User model includes virtual properties for clean profile responses
- All passwords are excluded from queries by default (`select: false`)
- Error handling middleware provides consistent error responses
- The application logs route registration and connection status on startup