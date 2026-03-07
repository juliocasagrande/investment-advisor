FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Usar npm install para regenerar o lock file
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
