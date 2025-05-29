# Use a Node.js base image with build tools
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy only package.json to install dependencies
COPY package.json ./

# Install system dependencies needed for native modules
RUN apt-get update && \
    apt-get install -y python3 g++ make && \
    npm install
RUN npm install express
# Copy the rest of your project files
COPY . .

# Expose port if needed (optional)
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]