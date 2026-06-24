FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm ci

COPY backend/ .

RUN npm run build

RUN npm ci --omit=dev

EXPOSE 3000

CMD ["npm", "start"]
