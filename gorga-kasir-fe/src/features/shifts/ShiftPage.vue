<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  closeShift,
  getCurrentShift,
  getShiftHistory,
  getShiftRecap,
  getStores,
  openShift,
  type ShiftRecapItemDto,
  type ShiftDto,
  type StoreDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const currentShift = ref<ShiftDto | null>(null);
const history = ref<ShiftDto[]>([]);
const recap = ref<ShiftRecapItemDto[]>([]);
const recapSummary = ref({
  shiftCount: 0,
  totalOpeningCash: 0,
  totalExpectedCash: 0,
  totalClosingCash: 0,
  totalDifference: 0
});
const loading = ref(false);
const opening = ref(false);
const closing = ref(false);
const error = ref("");
const toast = useToast();
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const historyFilters = reactive({
  status: "" as "" | "open" | "closed",
  startDate: "",
  endDate: ""
});

const openForm = reactive({
  openingCash: 0
});

const closeForm = reactive({
  closingCash: 0,
  notes: ""
});

const canOpenShift = computed(() => Boolean(selectedStoreId.value) && !currentShift.value);
const canCloseShift = computed(() => Boolean(currentShift.value));

function toRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
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

async function loadData() {
  if (!selectedStoreId.value) {
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const [current, historyResult, recapResult] = await Promise.all([
      getCurrentShift(selectedStoreId.value),
      getShiftHistory({
        page: 1,
        pageSize: 50,
        storeId: selectedStoreId.value,
        status: historyFilters.status || undefined,
        startDate: historyFilters.startDate || undefined,
        endDate: historyFilters.endDate || undefined
      }),
      getShiftRecap({
        storeId: selectedStoreId.value,
        startDate: historyFilters.startDate || undefined,
        endDate: historyFilters.endDate || undefined
      })
    ]);

    currentShift.value = current;
    history.value = historyResult.items;
    pagination.value = historyResult.pagination;
    recap.value = recapResult.items;
    recapSummary.value = recapResult.summary;

    if (current) {
      closeForm.closingCash = Number(current.openingCash);
    }
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data shift");
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  historyFilters.status = "";
  historyFilters.startDate = "";
  historyFilters.endDate = "";
  void loadData();
}

function exportHistoryCsv() {
  if (history.value.length === 0) {
    toast.warning("Tidak ada data untuk diexport");
    return;
  }

  const headers = ["Kasir", "Store", "Buka", "Tutup", "Kas Awal", "Kas Akhir", "Ekspektasi", "Selisih", "Status", "Catatan"];
  const rows = history.value.map((item) => [
    item.user.fullName,
    item.store.name,
    formatDate(item.openedAt),
    item.closedAt ? formatDate(item.closedAt) : "",
    Number(item.openingCash),
    item.closingCash !== null ? Number(item.closingCash) : "",
    item.expectedCash !== null ? Number(item.expectedCash) : "",
    item.cashDifference !== null ? Number(item.cashDifference) : "",
    item.status,
    item.notes ?? ""
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const storeName = stores.value.find((store) => store.id === selectedStoreId.value)?.name ?? "all-store";
  link.href = url;
  link.download = `shift-history-${storeName}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success("CSV berhasil diunduh");
}

function exportRecapCsv() {
  if (recap.value.length === 0) {
    toast.warning("Tidak ada data rekap untuk diexport");
    return;
  }

  const headers = [
    "Tanggal",
    "Kasir",
    "Store",
    "Jumlah Shift",
    "Total Kas Awal",
    "Total Ekspektasi",
    "Total Kas Akhir",
    "Total Selisih"
  ];
  const rows = recap.value.map((item) => [
    item.date,
    item.cashier.fullName,
    item.store.name,
    item.shiftCount,
    item.totalOpeningCash,
    item.totalExpectedCash,
    item.totalClosingCash,
    item.totalDifference
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const storeName = stores.value.find((store) => store.id === selectedStoreId.value)?.name ?? "all-store";
  link.href = url;
  link.download = `shift-recap-${storeName}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success("CSV rekap berhasil diunduh");
}

async function submitOpenShift() {
  if (!selectedStoreId.value) {
    toast.error("Pilih store dulu");
    return;
  }

  opening.value = true;
  try {
    await openShift({
      storeId: selectedStoreId.value,
      openingCash: Number(openForm.openingCash)
    });

    openForm.openingCash = 0;
    toast.success("Shift berhasil dibuka");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal membuka shift");
    toast.error(error.value);
  } finally {
    opening.value = false;
  }
}

async function submitCloseShift() {
  if (!currentShift.value) {
    toast.error("Tidak ada shift aktif");
    return;
  }

  closing.value = true;
  try {
    await closeShift({
      shiftId: currentShift.value.id,
      closingCash: Number(closeForm.closingCash),
      notes: closeForm.notes || undefined
    });

    closeForm.notes = "";
    toast.success("Shift berhasil ditutup");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menutup shift");
    toast.error(error.value);
  } finally {
    closing.value = false;
  }
}

watch(selectedStoreId, () => {
  void loadData();
});

onMounted(async () => {
  try {
    await loadStores();
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat halaman shift");
  }
});
</script>

<template>
  <section>
    <PageHeader title="Shift Kasir" subtitle="Buka/tutup shift dan pantau histori kasir per store.">
      <template #right>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="exportHistoryCsv"
        >
          Export CSV
        </button>
      </template>
    </PageHeader>

    <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <label class="mb-1 block text-xs text-slate-500">Store</label>
      <select v-model="selectedStoreId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-80">
        <option v-for="store in stores" :key="store.id" :value="store.id">
          {{ store.name }}
        </option>
      </select>
    </div>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <article class="rounded-xl border border-slate-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-900">Buka Shift</h2>
        <p class="mt-1 text-xs text-slate-500">Buat shift baru untuk kasir pada store terpilih.</p>

        <div class="mt-3 space-y-2">
          <input
            v-model.number="openForm.openingCash"
            type="number"
            min="0"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Kas awal"
          />
          <LoadingButton
            :loading="opening"
            :disabled="!canOpenShift"
            loading-text="Membuka..."
            class="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            @click="submitOpenShift"
          >
            Buka Shift
          </LoadingButton>
        </div>
      </article>

      <article class="rounded-xl border border-slate-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-900">Tutup Shift</h2>
        <p class="mt-1 text-xs text-slate-500">Tutup shift aktif dan catat selisih kas.</p>

        <div v-if="currentShift" class="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          <p><strong>Dibuka:</strong> {{ formatDate(currentShift.openedAt) }}</p>
          <p><strong>Kas Awal:</strong> {{ toRupiah(Number(currentShift.openingCash)) }}</p>
          <p><strong>Kasir:</strong> {{ currentShift.user.fullName }}</p>
        </div>
        <p v-else class="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Tidak ada shift aktif.</p>

        <div class="mt-3 space-y-2">
          <input
            v-model.number="closeForm.closingCash"
            type="number"
            min="0"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Kas akhir"
          />
          <input
            v-model="closeForm.notes"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Catatan (opsional)"
          />
          <LoadingButton
            :loading="closing"
            :disabled="!canCloseShift"
            loading-text="Menutup..."
            class="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
            @click="submitCloseShift"
          >
            Tutup Shift
          </LoadingButton>
        </div>
      </article>
    </div>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Histori Shift</h2>
        <span class="text-xs text-slate-500">{{ loading ? "Loading..." : `${pagination.total} shift` }}</span>
      </div>

      <div class="mt-3 grid gap-2 md:grid-cols-4">
        <select
          v-model="historyFilters.status"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          @change="loadData"
        >
          <option value="">Semua status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <input
          v-model="historyFilters.startDate"
          type="date"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          @change="loadData"
        />
        <input
          v-model="historyFilters.endDate"
          type="date"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          @change="loadData"
        />
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="resetFilters"
        >
          Reset Filter
        </button>
      </div>

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Kasir</th>
              <th class="px-3 py-2">Buka</th>
              <th class="px-3 py-2">Tutup</th>
              <th class="px-3 py-2">Kas Awal</th>
              <th class="px-3 py-2">Kas Akhir</th>
              <th class="px-3 py-2">Selisih</th>
              <th class="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in history" :key="item.id">
              <td class="px-3 py-2 text-slate-900">{{ item.user.fullName }}</td>
              <td class="px-3 py-2">{{ formatDate(item.openedAt) }}</td>
              <td class="px-3 py-2">{{ item.closedAt ? formatDate(item.closedAt) : '-' }}</td>
              <td class="px-3 py-2">{{ toRupiah(Number(item.openingCash)) }}</td>
              <td class="px-3 py-2">{{ item.closingCash ? toRupiah(Number(item.closingCash)) : '-' }}</td>
              <td class="px-3 py-2">
                <span v-if="item.cashDifference !== null">
                  {{ toRupiah(Number(item.cashDifference)) }}
                </span>
                <span v-else>-</span>
              </td>
              <td class="px-3 py-2">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="item.status === 'open' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'"
                >
                  {{ item.status }}
                </span>
              </td>
            </tr>
            <tr v-if="history.length === 0">
              <td colspan="7" class="px-3 py-4 text-center text-slate-500">Belum ada histori shift</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Rekap Selisih Kasir Harian</h2>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="exportRecapCsv"
        >
          Export Rekap CSV
        </button>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-5">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Total Shift</p>
          <p class="text-sm font-semibold text-slate-900">{{ recapSummary.shiftCount }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Total Kas Awal</p>
          <p class="text-sm font-semibold text-slate-900">{{ toRupiah(recapSummary.totalOpeningCash) }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Total Ekspektasi</p>
          <p class="text-sm font-semibold text-slate-900">{{ toRupiah(recapSummary.totalExpectedCash) }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Total Kas Akhir</p>
          <p class="text-sm font-semibold text-slate-900">{{ toRupiah(recapSummary.totalClosingCash) }}</p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs text-slate-500">Total Selisih</p>
          <p class="text-sm font-semibold" :class="recapSummary.totalDifference < 0 ? 'text-rose-700' : 'text-emerald-700'">
            {{ toRupiah(recapSummary.totalDifference) }}
          </p>
        </div>
      </div>

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Tanggal</th>
              <th class="px-3 py-2">Kasir</th>
              <th class="px-3 py-2">Store</th>
              <th class="px-3 py-2">Shift</th>
              <th class="px-3 py-2">Kas Awal</th>
              <th class="px-3 py-2">Ekspektasi</th>
              <th class="px-3 py-2">Kas Akhir</th>
              <th class="px-3 py-2">Selisih</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in recap" :key="`${item.date}-${item.cashier.id}-${item.store.id}`">
              <td class="px-3 py-2">{{ item.date }}</td>
              <td class="px-3 py-2 text-slate-900">{{ item.cashier.fullName }}</td>
              <td class="px-3 py-2">{{ item.store.name }}</td>
              <td class="px-3 py-2">{{ item.shiftCount }}</td>
              <td class="px-3 py-2">{{ toRupiah(item.totalOpeningCash) }}</td>
              <td class="px-3 py-2">{{ toRupiah(item.totalExpectedCash) }}</td>
              <td class="px-3 py-2">{{ toRupiah(item.totalClosingCash) }}</td>
              <td class="px-3 py-2" :class="item.totalDifference < 0 ? 'text-rose-700' : 'text-emerald-700'">
                {{ toRupiah(item.totalDifference) }}
              </td>
            </tr>
            <tr v-if="recap.length === 0">
              <td colspan="8" class="px-3 py-4 text-center text-slate-500">Belum ada data rekap shift</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
