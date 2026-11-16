# ==============================================================================
# THƯ VIỆN SIS (SIS Digital Library) — Multi-stage Production Dockerfile
# ==============================================================================

FROM node:22-alpine AS builder
WORKDIR /app

# Cài đặt đầy đủ dependencies (bao gồm devDependencies cho Vite & TypeScript build)
COPY package.json package-lock.json* bun.lock* ./
RUN npm install --no-audit --no-fund

# Copy mã nguồn và build giao diện React/Vite -> /app/dist
COPY . .
RUN npm run lint && npm run build

# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Cài đặt wget cho HEALTHCHECK và tzdata cho múi giờ Asia/Ho_Chi_Minh
RUN apk add --no-cache wget tzdata \
  && cp /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime \
  && echo "Asia/Ho_Chi_Minh" > /etc/timezone

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# Copy mã nguồn backend và tài nguyên đã biên dịch
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=builder /app/src ./src

# Tạo thư mục lưu trữ private vault & preview images, cấp quyền non-root (node)
RUN mkdir -p /app/storage/private-vault /app/storage/public-previews \
  && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health > /dev/null || exit 1

CMD ["npm", "start"]
