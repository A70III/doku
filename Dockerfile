# doku — โครง deploy (M5 S5) · **ยังไม่ใช้จริง**: docker มาหลัง M4 นิ่ง (docs/08 ข้อ 3)
# build: docker build -t doku . · run: docker compose up (ดู docker-compose.yml)
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

# vault = source of truth อยู่บน volume (/data/vault) · var = cache/index/revisions (อายุสั้น)
ENV DOKU_VAULT=/data/vault \
    DOKU_VAR=/data/var \
    DOKU_PORT=7667 \
    DOKU_HOST=0.0.0.0
EXPOSE 7667

# app.css เป็น gitignored artifact → build ก่อนเสมอ (บทเรียน docs/08 ข้อ 73: ขาด CSS = a11y แดง)
# editor.js ก็เป็น gitignored artifact (และ .dockerignore ตัด packages/server/public/ ออก) → build ใน image เหมือนกัน (ข้อ 37: ขาด = fallback textarea)
CMD ["sh", "-c", "bun run build:css && bun run build:editor && exec bun run packages/server/src/index.ts"]
