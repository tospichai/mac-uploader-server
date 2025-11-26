#!/bin/bash

# Get the port from environment variable or use default 3000
PORT=${PORT:-3000}

echo "🔍 Checking for processes using port $PORT..."

# Find and kill processes using the port
PIDS=$(lsof -ti:$PORT)

if [ -n "$PIDS" ]; then
    echo "🔪 Found processes using port $PORT: $PIDS"
    echo "🔪 Killing processes..."
    echo "$PIDS" | xargs kill -9
    echo "✅ Processes killed successfully"

    # Wait a moment for processes to fully terminate
    sleep 1
else
    echo "✅ Port $PORT is free"
fi

echo "🚀 Starting server on port $PORT..."
npm start