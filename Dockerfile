FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create a group and user with limited permissions
RUN addgroup -S hoytgroup && adduser -S hoytuser -G hoytgroup

# Set permissions
RUN chown -R hoytuser:hoytgroup /usr/src/app

# Change to non-root user
USER hoytuser

# Start the bot
CMD ["node", "dist/main.js"]