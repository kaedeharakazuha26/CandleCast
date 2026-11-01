FROM node:22-alpine
WORKDIR /app
COPY package.json package.json
COPY tsconfig.json tsconfig.json
COPY prisma prisma
RUN npm install
COPY src src
RUN npx prisma generate && npm run build
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
