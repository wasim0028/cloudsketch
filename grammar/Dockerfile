FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY diagram.peggy server.mjs ./
RUN npm run build
EXPOSE 7070
CMD ["node", "server.mjs"]
