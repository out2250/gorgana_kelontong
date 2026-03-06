<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { ROUTE_PATHS } from "@/constants/routes";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { getDashboardSummary, getStores, type DashboardSummary, type StoreDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const period = ref<"daily" | "weekly">("daily");
const summary = ref<DashboardSummary>({
  period: "daily",
  rangeStart: new Date().toISOString().slice(0, 10),
  rangeEnd: new Date().toISOString().slice(0, 10),
  date: new Date().toISOString().slice(0, 10),
  salesTotal: 0,
  expenseTotal: 0,
  grossProfitEstimate: 0,
  transactionCount: 0,
  lowStockCount: 0,
  lowStockItems: [],
  topProducts: [],
  slowMovingProducts: [],
  busyHours: [],
  categoryMargins: []
});
const loading = ref(false);
const error = ref("");
const router = useRouter();

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100, isActive: true });
  stores.value = result.items;
  if (!selectedStoreId.value && stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
  }
}

async function loadSummary() {
  loading.value = true;
  try {
    summary.value = await getDashboardSummary({
      storeId: selectedStoreId.value || undefined,
      date: new Date().toISOString().slice(0, 10),
      period: period.value
    });
    error.value = "";
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat dashboard");
  } finally {
    loading.value = false;
  }
}

function goToRestock(product: DashboardSummary["lowStockItems"][number]) {
  const suggestedQty = Math.max(product.recommendedRestockQty || (product.minimumStock - product.stockOnHand), 1);
  void router.push({
    path: ROUTE_PATHS.purchases,
    query: {
      ...(selectedStoreId.value ? { storeId: selectedStoreId.value } : {}),
      productId: product.id,
      qty: String(suggestedQty)
    }
  });
}

onMounted(async () => {
  await loadStores();
  await loadSummary();
});
</script>

<template>
  <section>
    <PageHeader title="Dashboard" subtitle="Ringkasan performa harian toko kelontong." />

    <div class="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Semua Store</option>
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <select v-model="period" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="daily">Harian</option>
        <option value="weekly">Mingguan</option>
      </select>
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="loading" @click="loadSummary">
        {{ loading ? "Memuat..." : "Refresh" }}
      </button>
    </div>

    <p class="mt-2 text-xs text-slate-500">Periode laporan: {{ summary.rangeStart }} s/d {{ summary.rangeEnd }}</p>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article class="card">
        <h3 class="card-title">Penjualan Harian</h3>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ formatCurrency(summary.salesTotal) }}</p>
      </article>
      <article class="card">
        <h3 class="card-title">Pengeluaran Harian</h3>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ formatCurrency(summary.expenseTotal) }}</p>
      </article>
      <article class="card">
        <h3 class="card-title">Estimasi Profit</h3>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ formatCurrency(summary.grossProfitEstimate) }}</p>
      </article>
      <article class="card">
        <h3 class="card-title">Transaksi Hari Ini</h3>
        <p class="mt-2 text-lg font-bold text-slate-900">{{ summary.transactionCount }}</p>
      </article>
    </div>

    <article class="mt-4 card">
      <h3 class="card-title">Low Stock Notification ({{ summary.lowStockCount }})</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="item in summary.lowStockItems" :key="item.id" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <p>{{ item.name }}</p>
            <p class="text-xs text-slate-500">Avg jual/hari: {{ item.avgDailySales }} • Saran restock: {{ item.recommendedRestockQty }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-medium text-amber-700">{{ item.stockOnHand }} / min {{ item.minimumStock }}</span>
            <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="goToRestock(item)">Buat Restock</button>
          </div>
        </li>
        <li v-if="summary.lowStockItems.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
          Tidak ada produk low stock.
        </li>
      </ul>
    </article>

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      <article class="card">
        <h3 class="card-title">Top Product</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in summary.topProducts" :key="item.id" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>{{ item.name }}</span>
            <span class="text-right">
              <strong>{{ item.quantity }}x</strong>
              <span class="ml-2 text-slate-500">{{ formatCurrency(item.revenue) }}</span>
            </span>
          </li>
          <li v-if="summary.topProducts.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Belum ada data.</li>
        </ul>
      </article>

      <article class="card">
        <h3 class="card-title">Produk Lambat Bergerak</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in summary.slowMovingProducts" :key="item.id" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <p>{{ item.name }}</p>
              <p class="text-xs text-slate-500">
                {{ item.daysWithoutSale !== null ? `${item.daysWithoutSale} hari tanpa penjualan` : 'Belum pernah terjual' }}
              </p>
            </div>
            <span class="text-slate-600">Stok {{ item.stockOnHand }}</span>
          </li>
          <li v-if="summary.slowMovingProducts.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Semua produk ada pergerakan.</li>
        </ul>
      </article>

      <article class="card">
        <h3 class="card-title">Jam Ramai</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in summary.busyHours" :key="item.hour" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span>{{ item.hour.toString().padStart(2, '0') }}:00</span>
            <strong>{{ item.transactions }} transaksi</strong>
          </li>
          <li v-if="summary.busyHours.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Belum ada data.</li>
        </ul>
      </article>

      <article class="card">
        <h3 class="card-title">Margin Kategori</h3>
        <ul class="mt-3 space-y-2 text-sm">
          <li v-for="item in summary.categoryMargins" :key="item.category" class="rounded-lg bg-slate-50 px-3 py-2">
            <div class="flex items-center justify-between">
              <span>{{ item.category }}</span>
              <strong>{{ formatCurrency(item.grossMargin) }}</strong>
            </div>
            <div class="mt-1 text-xs text-slate-500">
              Revenue {{ formatCurrency(item.revenue) }} • Cost {{ formatCurrency(item.estimatedCost) }}
            </div>
          </li>
          <li v-if="summary.categoryMargins.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Belum ada data.</li>
        </ul>
      </article>
    </div>
  </section>
</template>
