#!/bin/bash

# Stop on first error
set -e

# Display welcome message
echo "==== HOYT Bot Build Script ===="
echo "This script will build the HOYT Bot and prepare it for deployment."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found. Please create one from .env.example"
  exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Run linting
echo "Running linter..."
npm run lint

# Run tests
echo "Running tests..."
npm test

# Build TypeScript
echo "Building TypeScript code..."
npm run build

# Check if build was successful
if [ ! -d ./dist ]; then
  echo "Build failed: dist directory not found"
  exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Success message
echo "==== Build completed successfully! ===="
echo "You can now run the bot with 'npm start' or 'node dist/main.js'"
echo "For production deployments, consider using Docker with 'docker-compose up -d'"