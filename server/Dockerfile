FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
EXPOSE 8787
ENV HOST=0.0.0.0 PORT=8787
CMD ["node","server/signaling.mjs"]
