# Klontong Digital

Sistem informasi kelontong kampung berbasis multi-store dengan strategi offline-first untuk transaksi kasir.

## Struktur Project

- `gorga-kasir-fe`: Vue 3 + Vite frontend (offline queue)
- `gorga-kasir-be`: Fastify + Prisma backend (multi-tenant, subscription gate)
- `docs/mvp-scope-v1.md`: scope produk MVP
- `docs/architecture-erd.md`: arsitektur dan ERD
- `docs/manual-book-aplikasi.md`: manual book operasional end-to-end semua role
- `docs/tenant-subscription-system-design.md`: desain ERD/schema/API/RBAC/lifecycle subscription tenant

## Prasyarat

- Node.js 20+
- MySQL 8+

## Setup Backend

1. Masuk folder backend:
   - `cd gorga-kasir-be`
2. Install dependency:
   - `npm install`
3. Copy env:
   - PowerShell: `Copy-Item .env.example .env`
4. Generate prisma client:
   - `npm run prisma:generate`
5. Migrasi DB:
   - `npm run prisma:migrate`
6. Seed data demo (opsional):
   - `npm run prisma:seed`
7. Jalankan backend:
   - `npm run dev`

Backend aktif di `http://localhost:4000`.

## Setup Frontend

1. Masuk folder frontend:
   - `cd gorga-kasir-fe`
2. Install dependency:
   - `npm install`
3. Copy env:
   - PowerShell: `Copy-Item .env.example .env`
4. Jalankan frontend:
   - `npm run dev`

Frontend aktif di `http://localhost:5173`.

## Endpoint MVP Implemented

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET/POST /api/users`
- `GET/POST /api/stores`
- `PATCH /api/stores/:id/status` (owner approve/reject store aktif)
- `GET/POST /api/products`
- `POST /api/stock/movements`
- `GET /api/shifts/current`
- `GET /api/shifts/history`
- `POST /api/shifts/open`
- `POST /api/shifts/close`
- `GET /api/shifts/recap`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/report`
- `GET /api/sales`
- `POST /api/sales`
- `GET /api/sales/:id`
- `POST /api/sales/:id/return`
- `POST /api/sales/:id/return-partial`
- `GET /api/finance/summary`
- `GET/POST /api/expenses`
- `GET/POST /api/purchases`
- `GET/POST /api/stock-opname/sessions`
- `GET/POST /api/support/tickets`
- `PATCH /api/support/tickets/:id/status`
- `POST /api/sync/sales` (JWT + subscription active/trial)
- `GET /api/admin/subscriptions` (JWT super admin)
- `PATCH /api/admin/tenants/:tenantId/subscription` (JWT super admin)

## Quick Verify

1. Health check backend:
   - `Invoke-RestMethod http://localhost:4000/api/health`
2. Login demo seed:
   - owner: `owner@klontong.local`
   - manager: `manager@klontong.local`
   - kasir: `cashier@klontong.local`
   - password: `password123`

## Catatan MVP

- Offline-first saat ini berbasis outbox queue di browser (IndexedDB).
- Sinkronisasi menggunakan `idempotencyKey` untuk mencegah duplikasi transaksi.
- Customer portal subscription belum dibuat (next development).
