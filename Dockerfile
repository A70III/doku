# doku — image สำหรับ deploy บน home server (M5 · ผ่าน build+run ทดสอบแล้ว · docs/08 ข้อ 3: docker มาหลัง M4 นิ่ง)
# build: docker build -t doku:local . · run: docker compose up -d (ดู docker-compose.yml)
FROM oven/bun:1-alpine
WORKDIR /app

# deps ก่อน source เพื่อ cache ชั้น — package.json แต่ละ workspace ต้องมาก่อน bun install
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/fs-node/package.json packages/fs-node/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY packages/mcp/package.json packages/mcp/
RUN bun install --frozen-lockfile

COPY . .

# app.css + editor.js = gitignored artifacts (.dockerignore ตัด packages/server/public/ ออก)
# → build ตอนสร้าง image เลย ไม่ build ตอน runtime (ข้อ 73: ขาด CSS = a11y แดง ·
#   ข้อ 37: ขาด editor.js = fallback textarea) — และ container รันเป็น non-root จะเขียน /app ไม่ได้
RUN bun run build:css && bun run build:editor

# รันเป็น uid 1000 (`bun` user ที่ image มีอยู่แล้ว = user บน home server) — ไฟล์ที่เขียนลง
# bind mount `/data/vault` จึงเป็นของ user เดียวกับ host จัดการต่อได้ตามปกติ
# · /data/var (named volume: cache/index/revisions/audit) ต้องเขียนได้ตั้งแต่ volume ถูก initialize
RUN mkdir -p /data/var && chown -R bun:bun /data
USER bun

# vault = source of truth อยู่บน volume (host bind) · var = cache/index/revisions/audit (อายุสั้น)
ENV DOKU_VAULT=/data/vault \
    DOKU_VAR=/data/var \
    DOKU_PORT=7667 \
    DOKU_HOST=0.0.0.0
EXPOSE 7667

CMD ["bun", "run", "packages/server/src/index.ts"]
