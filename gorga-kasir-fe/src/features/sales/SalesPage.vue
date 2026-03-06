<script setup lang="ts">
import { onMounted, ref } from "vue";

import PageFilterBar from "@/components/PageFilterBar.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { getSaleDetail, getSales, getStores, returnSale, returnSalePartial, type SaleDto, type StoreDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const startDate = ref("");
const endDate = ref("");
const sales = ref<SaleDto[]>([]);
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const error = ref("");
const returningSaleId = ref("");
const partialReturningSaleId = ref("");
const toast = useToast();

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID");
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100, isActive: true });
  stores.value = result.items;

  if (!selectedStoreId.value && stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
  }
}

async function loadSales() {
  try {
    const result = await getSales({
      page: page.value,
      pageSize: 10,
      storeId: selectedStoreId.value || undefined,
      startDate: startDate.value ? `${startDate.value}T00:00:00.000Z` : undefined,
      endDate: endDate.value ? `${endDate.value}T23:59:59.999Z` : undefined
    });

    sales.value = result.items;
    pagination.value = result.pagination;
    error.value = "";
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data sales");
  }
}

async function exportSalesCsv() {
  try {
    const result = await getSales({
      page: 1,
      pageSize: 500,
      storeId: selectedStoreId.value || undefined,
      startDate: startDate.value ? `${startDate.value}T00:00:00.000Z` : undefined,
      endDate: endDate.value ? `${endDate.value}T23:59:59.999Z` : undefined
    });

    if (result.items.length === 0) {
      toast.warning("Tidak ada data sales untuk diexport");
      return;
    }

    const headers = ["Waktu", "Store", "Kasir", "Metode", "Subtotal", "Diskon", "Promo", "Total", "Ref"];
    const rows = result.items.map((item) => [
      formatDate(item.soldAt),
      item.store.name,
      item.cashier.fullName,
      item.paymentMethod,
      Number(item.subtotal),
      Number(item.discount),
      Number(item.promoDiscount ?? 0),
      Number(item.total),
      item.referenceNumber ?? ""
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV sales berhasil diunduh");
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal export CSV sales"));
  }
}

async function handleReturnSale(sale: SaleDto) {
  const confirmed = window.confirm(`Retur penuh transaksi ${sale.id.slice(0, 8)}? Stok akan dikembalikan.`);
  if (!confirmed) {
    return;
  }

  const reason = window.prompt("Alasan retur (opsional):")?.trim();

  returningSaleId.value = sale.id;
  try {
    await returnSale({ saleId: sale.id, reason: reason || undefined });
    toast.success("Retur transaksi berhasil");
    await loadSales();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal melakukan retur transaksi");
    toast.error(message);
  } finally {
    returningSaleId.value = "";
  }
}

async function handlePartialReturnSale(sale: SaleDto) {
  partialReturningSaleId.value = sale.id;
  try {
    const detail = await getSaleDetail(sale.id);
    const selectedItems: Array<{ productId: string; quantity: number }> = [];

    for (const item of detail.items) {
      const answer = window.prompt(
        `Retur parsial untuk ${item.product.name}.\nQty terjual: ${item.quantity}\nIsi qty retur (0 untuk skip).`,
        "0"
      );

      if (answer === null) {
        continue;
      }

      const quantity = Number(answer);
      if (!Number.isFinite(quantity) || quantity < 0) {
        toast.warning("Qty retur tidak valid, item di-skip");
        continue;
      }

      if (quantity > 0) {
        selectedItems.push({
          productId: item.productId,
          quantity: Math.floor(quantity)
        });
      }
    }

    if (selectedItems.length === 0) {
      toast.warning("Tidak ada item yang dipilih untuk retur parsial");
      return;
    }

    const reason = window.prompt("Alasan retur parsial (opsional):")?.trim();

    await returnSalePartial({
      saleId: sale.id,
      reason: reason || undefined,
      items: selectedItems
    });

    toast.success("Retur parsial berhasil");
    await loadSales();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal melakukan retur parsial");
    toast.error(message);
  } finally {
    partialReturningSaleId.value = "";
  }
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadSales();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadSales();
  }
}

onMounted(async () => {
  await loadStores();
  await loadSales();
});
</script>

<template>
  <section>
    <PageHeader title="Sales Transaction" subtitle="Riwayat penjualan harian per toko.">
      <template #right>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="exportSalesCsv"
        >
          Export CSV
        </button>
      </template>
    </PageHeader>

    <PageFilterBar unstyled class="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Semua Store</option>
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <input v-model="startDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input v-model="endDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadSales">Filter</button>
    </PageFilterBar>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Waktu</th>
            <th class="px-4 py-3">Store</th>
            <th class="px-4 py-3">Kasir</th>
            <th class="px-4 py-3">Metode</th>
            <th class="px-4 py-3">Total</th>
            <th class="px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="sale in sales" :key="sale.id">
            <td class="px-4 py-3">{{ formatDate(sale.soldAt) }}</td>
            <td class="px-4 py-3">{{ sale.store.name }}</td>
            <td class="px-4 py-3">{{ sale.cashier.fullName }}</td>
            <td class="px-4 py-3">{{ sale.paymentMethod }}</td>
            <td class="px-4 py-3">{{ formatCurrency(Number(sale.total)) }}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1">
                <button
                  class="rounded border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="returningSaleId === sale.id || partialReturningSaleId === sale.id"
                  @click="handleReturnSale(sale)"
                >
                  {{ returningSaleId === sale.id ? "Memproses..." : "Retur Full" }}
                </button>
                <button
                  class="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="partialReturningSaleId === sale.id || returningSaleId === sale.id"
                  @click="handlePartialReturnSale(sale)"
                >
                  {{ partialReturningSaleId === sale.id ? "Memproses..." : "Retur Parsial" }}
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="sales.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">Belum ada transaksi</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>
  </section>
</template>
