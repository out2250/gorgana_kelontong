# Gorga Kasir BE

Backend API untuk Klontong Digital (multi-store SaaS + subscription + offline sync sales).

## Stack
- Fastify + TypeScript
- Prisma + MySQL 8
- JWT auth + refresh token rotation
- Zod validation
- Security headers (`@fastify/helmet`)
- Endpoint rate limit (`@fastify/rate-limit`) untuk auth/sync

## Security Config (Env)
- `RATE_LIMIT_AUTH_MAX` (default `20`)
- `RATE_LIMIT_AUTH_WINDOW` (default `1 minute`)
- `RATE_LIMIT_SYNC_MAX` (default `40`)
- `RATE_LIMIT_SYNC_WINDOW` (default `1 minute`)

## Setup Local
1. Copy `.env.example` menjadi `.env`
2. Install dependency: `npm install`
3. Generate Prisma client: `npm run prisma:generate`
4. Jalankan migrasi: `npm run prisma:migrate`
5. Jalankan server: `npm run dev`

> Setelah update schema terbaru, jalankan migrasi baru sebelum start server.

## Endpoint MVP
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/health`
- `GET/POST /api/users` (owner/manager)
- `GET/POST /api/stores` (POST owner only)
- `PATCH /api/stores/:id/status` (owner only)
- `GET/POST /api/products` (POST owner/manager)
- `POST /api/stock/movements`
- `GET/POST /api/purchases` (owner/manager)
- `GET /api/finance/summary` (owner/manager)
- `GET/POST /api/expenses` (owner/manager)
- `GET /api/sales/:id` (detail transaksi)
- `POST /api/sales/:id/return` (owner/manager/cashier)
- `POST /api/sales/:id/return-partial` (owner/manager/cashier)
- `GET /api/shifts/current`
- `GET /api/shifts/history`
- `GET /api/shifts/recap`
- `POST /api/shifts/open`
- `POST /api/shifts/:id/close`
- `GET/POST /api/support/tickets`
- `PATCH /api/support/tickets/:id/status` (owner/manager)
- `POST /api/sync/sales` (butuh Bearer token + subscription aktif)
- `GET /api/admin/subscriptions` (super admin only)
- `PATCH /api/admin/tenants/:tenantId/subscription` (super admin only)

## Fitur Sales Tambahan (Prioritas Operasional)
- Diskon item per baris transaksi.
- Diskon transaksi + promo code berbasis jam (`HAPPYHOUR10`, `PAGIPROMO5`).
- Metode bayar detail: cash/qris/transfer/split (cash+qris), validasi nominal bayar, hitung kembalian.
- Penyimpanan detail pembayaran (`paymentDetails`, `referenceNumber`, `paidAmount`, `changeAmount`).

## Laporan Dashboard (Harian/Mingguan)
- `GET /api/dashboard/summary?period=daily|weekly`
- Top product, jam ramai, dan margin kasar per kategori.

## List Query Support
- Users/Stores/Products/Expenses/Tickets support `page`, `pageSize`, `search` (+ filter spesifik).
- Response list pakai format `{ items, pagination }`.

## Smoke Test API
1. Pastikan server backend sudah jalan (`npm run dev`)
2. Jalankan smoke test: `npm run smoke:api`
3. Optional base URL custom: `API_BASE_URL=http://localhost:4000/api npm run smoke:api`

Smoke test mencakup:
- auth login + refresh
- sales create + idempotency duplicate
- dashboard summary
- admin subscription list + update
