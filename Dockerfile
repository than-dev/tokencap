FROM node:20-alpine

WORKDIR /app

# Install native dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
RUN npm install

COPY . .

# Build step
RUN npm run build

# Ensure node user owns the app directory
RUN chown -R node:node /app

USER node

# We expose a volume for persistent sqlite and config
VOLUME ["/app/tokencap.json", "/app/tokencap.sqlite"]

EXPOSE 8787

CMD ["npm", "run", "start"]
