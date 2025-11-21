# Photo Upload Server - Refactored Architecture

## Overview

This is a refactored version of the photo upload server with a modular, maintainable architecture. The server handles photo uploads, image processing, S3 storage, and real-time updates via Server-Sent Events.

## Project Structure

```
server/
├── config/                 # Configuration management
│   ├── index.js           # Main configuration with environment variables
│   └── constants.js       # Application constants
├── middleware/             # Express middleware
│   ├── auth.js            # API key authentication
│   ├── cors.js            # CORS configuration
│   ├── errorHandler.js     # Error handling utilities
│   └── logger.js          # Request logging
├── routes/                # API routes
│   ├── index.js           # Route aggregation
│   ├── health.js          # Health check endpoints
│   └── photos.js          # Photo-related routes
├── services/              # Business logic services
│   ├── imageService.js     # Image processing operations
│   ├── s3Service.js       # AWS S3 operations
│   └── sseService.js      # Server-Sent Events management
├── utils/                 # Utility functions
│   ├── fileUtils.js       # File handling utilities
│   └── responseUtils.js    # Response formatting utilities
├── views/                 # HTML templates
│   ├── error.html          # Error page template
│   └── gallery.html        # Photo gallery template
├── public/                # Static assets
│   └── js/
│       └── gallery.js      # Client-side JavaScript
├── server.js              # Main application entry point
├── package.json            # Dependencies and scripts
└── .env                   # Environment variables
```

## Key Features

### 1. Modular Architecture
- **Separation of Concerns**: Each module has a specific responsibility
- **Maintainability**: Easy to locate and modify specific functionality
- **Testability**: Individual components can be tested in isolation
- **Scalability**: New features can be added without affecting existing code

### 2. Configuration Management
- Centralized configuration in `config/` directory
- Environment variable validation
- Support for different environments (development, production)

### 3. Middleware System
- **Authentication**: API key validation
- **CORS**: Cross-origin resource sharing
- **Logging**: Request/response logging with performance tracking
- **Error Handling**: Centralized error processing

### 4. Service Layer
- **Image Service**: Handles image processing, format conversion, and optimization
- **S3 Service**: Manages AWS S3 operations (upload, download, list)
- **SSE Service**: Real-time updates via Server-Sent Events

### 5. API Endpoints

#### Photo Management
- `POST /api/events/:event_code/photos` - Upload photos
- `GET /:event_code/photos` - View photo gallery
- `GET /:event_code/photos/:photoId` - Download specific photo
- `GET /:event_code/photos/stream` - SSE stream for real-time updates

#### Health Check
- `GET /api/health` - Server health status

### 6. Image Processing
- **Format Support**: JPEG, PNG (direct upload), NEF (conversion)
- **Automatic Conversion**: Unsupported formats converted to JPEG
- **Optimization**: Resized to max width 2048px with quality 85%
- **Thumbnails**: Automatic thumbnail generation

### 7. Real-time Updates
- **Server-Sent Events**: Live photo updates
- **Connection Management**: Automatic reconnection with backoff
- **Broadcast System**: Efficient multi-client updates

## Environment Variables

Create a `.env` file in the server directory:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-southeast-1
S3_BUCKET=your_bucket_name

# API Configuration
EXPECTED_API_KEY=your_api_key

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Installation and Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (see above)

3. Start the server:
```bash
npm start
```

## API Usage

### Upload Photos

```bash
curl -X POST \
  -F "original_file=@photo.jpg" \
  -F "thumb_file=@thumb.jpg" \
  -F "original_name=My Photo" \
  -F "api_key=your_api_key" \
  http://localhost:3000/api/events/myevent/photos
```

### View Gallery

Access in browser:
```
http://localhost:3000/myevent/photos
```

### Health Check

```bash
curl "http://localhost:3000/api/health?api_key=your_api_key"
```

## Development

### Adding New Features

1. **Routes**: Add new routes in `routes/` directory
2. **Services**: Implement business logic in `services/`
3. **Middleware**: Add reusable middleware in `middleware/`
4. **Utils**: Create utility functions in `utils/`

### Error Handling

The application uses centralized error handling:
- Custom error classes in `middleware/errorHandler.js`
- Consistent error response format
- Proper HTTP status codes
- Development vs production error details

### Logging

Comprehensive logging system:
- Request/response logging with timing
- Error logging with stack traces
- Performance monitoring
- Debug logging in development mode

## Production Considerations

1. **Security**: Use proper API keys and HTTPS
2. **Performance**: Monitor S3 operation times
3. **Scaling**: Consider load balancing for high traffic
4. **Monitoring**: Set up proper logging and monitoring

## Testing

The modular structure makes testing easier:
- Unit tests for individual services
- Integration tests for routes
- End-to-end tests for complete workflows

## Migration from Original

This refactored version maintains full compatibility with the original monolithic `server.js` while providing:
- Better code organization
- Easier maintenance
- Improved testability
- Enhanced error handling
- Better logging and monitoring