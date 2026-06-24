FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm ci --only=production

COPY backend/ .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
