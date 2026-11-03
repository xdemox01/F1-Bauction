# Grid Auction multiplayer server. No npm packages are needed at runtime:
# the browser client is pre-built in public/f1a.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/f1a/server/main.ts"]
