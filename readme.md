# Express Modern API

A modern Express.js API with MongoDB, JWT authentication, WebSocket support, and Swagger documentation.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your values:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/express5_app?authSource=admin
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:3000
```

### 3. Start MongoDB (with Docker)
```bash
docker-compose up -d
```

### 4. Start Development Server
```bash
npm run dev
```

## 📚 API Documentation

- **Swagger UI**: http://localhost:3000/api-docs
- **Swagger JSON Export**: http://localhost:3000/swagger-export
- **Health Check**: http://localhost:3000/health

## 🧪 Test the API

### Register a new user:
```bash
curl -X 'POST' \
  'http://localhost:3000/api/auth/register' \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}'
```

### Login:
```bash
curl -X 'POST' \
  'http://localhost:3000/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
  "email": "john@example.com",
  "password": "password123"
}'
```

## 📁 Project Structure

```
├── src/
│   ├── app.js              # Main application file
│   ├── config/             # Configuration files
│   ├── middleware/         # Custom middleware
│   ├── models/             # MongoDB models
│   ├── routes/             # API routes
│   └── socket/             # WebSocket handlers
├── .env                    # Environment variables (create this)
├── .env.example            # Environment template
├── docker-compose.yml      # MongoDB setup
└── package.json            # Dependencies
```

## 🔧 Available Scripts

```bash
npm start          # Production server
npm run dev        # Development with hot reload
npm test           # Run tests
npm run lint       # Check code style
npm run lint:fix   # Fix code style issues
```

## 🗄️ Database

- **MongoDB UI**: http://localhost:8082 (Mongo Express)
- **Default credentials**: admin / password123

## 🔑 Authentication

The API uses JWT tokens. After login/register, include the token in requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/users/profile
```

## 👑 Admin Users

### Creating Admin Users

By default, all users are created with the `user` role. To create admin users:

#### Method 1: Using the Admin Script
```bash
# First, register a normal user
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Admin User",
    "email": "admin@example.com", 
    "password": "admin123"
  }'

# Then promote them to admin using the script
node scripts/make-admin.js admin@example.com
```

#### Method 2: Direct Database Update
```bash
# Connect to MongoDB and update user role
mongo mongodb://admin:password123@localhost:27017/express5_app?authSource=admin
db.users.updateOne({email: "admin@example.com"}, {$set: {role: "admin"}})
```

### Admin API Endpoints

Admin users have access to additional endpoints under `/api/admin/`:

#### User Management
```bash
# Get all users with session statistics
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  "http://localhost:3000/api/admin/users?limit=50&page=1&sortBy=sessionCount&sortOrder=desc"

# Get sessions for a specific user  
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  "http://localhost:3000/api/admin/users/USER_ID/sessions?limit=20&status=active"
```

#### Session Management
```bash
# Delete any session (admin only)
curl -X DELETE \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  "http://localhost:3000/api/admin/sessions/SESSION_ID"
```

#### System Analytics
```bash
# Get comprehensive system statistics
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  "http://localhost:3000/api/admin/stats"
```

### Admin Features

- **User Overview**: View all users with session counts, total samples, and activity metrics
- **Session Management**: Access and delete any user's sessions with associated data chunks
- **System Analytics**: Monitor total users, sessions, data chunks, storage usage, and performance metrics
- **Pagination & Filtering**: All admin endpoints support pagination, sorting, and filtering
- **Real-time Stats**: Get current active sessions and recent activity

### Admin Dashboard Data

The admin endpoints provide comprehensive data for building admin dashboards:

- Total users and users with active sessions
- Session distribution (active/completed/error)
- Data storage usage and chunk statistics
- Average samples per session and per user
- Recent session activity and trends
- Individual user session history and data usage

## 🚨 Troubleshooting

### Port already in use
```bash
# Kill process on port 3000
sudo lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=8000 npm run dev
```

### MongoDB connection issues
```bash
# Check if MongoDB is running
docker-compose ps

# Restart MongoDB
docker-compose restart mongodb
```

---

**Happy coding! 🎉**