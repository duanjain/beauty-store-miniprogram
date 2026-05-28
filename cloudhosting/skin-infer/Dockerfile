FROM node:18-slim

WORKDIR /app

COPY package.json ./package.json

RUN npm config set fund false && npm config set audit false && npm install --omit=dev

COPY . .

EXPOSE 80

CMD ["npm", "start"]
