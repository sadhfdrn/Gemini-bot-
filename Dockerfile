# Use a base image with Node.js and Debian (good for native builds)
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy only the package.json
COPY package.json ./

# Install system dependencies: build tools + cmake (required for raknet-native)
RUN apt-get update && \
    apt-get install -y python3 g++ make cmake && \
    npm install

# Copy the rest of your code
COPY . .

# Expose port (optional)
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
