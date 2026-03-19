FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=https://investment-advisor-production.up.railway.app/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]