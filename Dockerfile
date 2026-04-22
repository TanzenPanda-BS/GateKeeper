FROM node:20-slim

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Expose port and start
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
