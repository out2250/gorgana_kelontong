# Gorga Kasir FE

Frontend untuk Klontong Digital (multi-store + offline-first sync) menggunakan Vue.js.

## Stack
- Vue 3 + Vite
- TypeScript
- Vue Router
- Pinia
- Tailwind CSS
- IndexedDB (`idb`) for offline queue

## Struktur (mengacu referensi)
- `src/router`: routes + auth guard
- `src/layouts`: layout aplikasi utama
- `src/features`: halaman per modul (auth, users, stores, inventory, finance, support, sync)
- `src/services`: API client + offline queue
- `src/store`: auth session state

## Run Local
1. Copy `.env.example` ke `.env`
2. Set `VITE_API_BASE_URL`
3. Install dependencies: `npm install`
4. Start dev server: `npm run dev`
5. Build check: `npm run build`

## Modul MVP yang sudah ada di UI
- POS Kasir (cart + checkout + offline queue fallback + discount item/transaksi + promo code + split payment)
- Shift Kasir (buka/tutup shift + histori shift + rekap selisih kasir harian + export CSV)
- Sales Transaction (filter + retur penuh + retur parsial + export CSV)
- User Management
- Kelontong Management (multi-store)
- Inventory Management (+ export CSV)
- Purchase / Restock (input supplier + stok masuk + histori harga beli)
- Finance Data Management (+ export CSV)
- Support Management (internal-only)
- Offline Sync page (queue lokal + sync ke backend)
- Admin Subscription page (aktif/nonaktif tenant oleh super admin)
- Print struk sederhana dari POS (transaksi terakhir).
- Dashboard period harian/mingguan (top product, jam ramai, margin kategori).
- Low stock actionable: tombol "Buat Restock" dari dashboard ke halaman Purchase dengan prefill produk/qty.

## Auth Behavior
- Access token + refresh token
- Auto refresh saat `401` (interceptor)
- Auto logout ketika access token expired dan refresh gagal