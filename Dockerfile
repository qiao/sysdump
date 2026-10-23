FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY server.ts ./
EXPOSE 3000
USER node
CMD ["node", "server.ts"]
