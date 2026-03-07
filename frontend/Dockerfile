FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# IMPORTANTE: Definir a URL da API para o build
ENV VITE_API_URL=https://investment-advisor-production.up.railway.app/api

RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
