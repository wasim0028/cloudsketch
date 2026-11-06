# Build context is the repo root (the frontend compiles ../grammar/diagram.peggy)
FROM node:22-alpine
WORKDIR /repo
COPY grammar/diagram.peggy grammar/
COPY frontend/package.json frontend/package-lock.json* frontend/
WORKDIR /repo/frontend
RUN npm install
COPY frontend/ .
EXPOSE 5173
# Dev server: hot reload + /api proxy to the backend (research setup, not production)
CMD ["npm", "run", "dev", "--", "--port", "5173"]
