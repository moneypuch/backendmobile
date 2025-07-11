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