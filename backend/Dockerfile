FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Railway sets PORT dynamically; EXPOSE can be anything but should match typical
EXPOSE 8080

CMD ["node", "server.js"]