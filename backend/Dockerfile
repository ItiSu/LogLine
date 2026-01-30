FROM node:18-alpine

WORKDIR /app

# Install all language compilers and interpreters
RUN apk add --no-cache \
    python3 \
    py3-pip \
    openjdk17 \
    gcc \
    g++ \
    musl-dev \
    rust \
    cargo \
    go \
    bash

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start the server
CMD ["npm", "start"]