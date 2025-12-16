FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci

# Copy the rest
COPY . .

EXPOSE 3001

# default to dev for local docker-compose (override for prod if needed)
CMD ["npm", "run", "dev"]