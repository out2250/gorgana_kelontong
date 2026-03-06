<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import {
  closeFinancePeriod,
  createExpense,
  getApAging,
  getExpenses,
  getFinanceSummary,
  getPeriodClosingStatus,
  getStores,
  getUsers,
  settleApPurchase,
  updateInventoryCostingMethod,
  type ApAgingItem,
  type ExpenseDto,
  type FinanceSummary,
  type PeriodClosingResponse,
  type StoreDto,
  type UserDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

const auth = useAuthStore();
const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const summary = ref<FinanceSummary>({ salesTotal: 0, expenseTotal: 0, grossProfitEstimate: 0 });
const expenses = ref<ExpenseDto[]>([]);
const apAgingItems = ref<ApAgingItem[]>([]);
const apAgingSummary = ref<Record<"0-30" | "31-60" | "61-90" | ">90", number>>({
  "0-30": 0,
  "31-60": 0,
  "61-90": 0,
  ">90": 0
});
const periodClosing = ref<PeriodClosingResponse>({
  closedThroughAt: null,
  closureHistory: []
});
const usersById = ref<Record<string, UserDto>>({});
const error = ref("");
const submitting = ref(false);
const settlingIds = ref<string[]>([]);
const settlingAll = ref(false);
const closing = ref(false);
const savingCostingMethod = ref(false);
const toast = useToast();
const search = ref("");
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const closePeriodInput = ref("");
const selectedCostingMethod = ref<"weighted_average" | "fifo">("weighted_average");
const showUnsettledOnly = ref(true);
const autoRefreshTimer = ref<number | null>(null);

const canClosePeriod = computed(() => {
  return Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner");
});

const filteredApAgingItems = computed(() => {
  if (!showUnsettledOnly.value) {
    return apAgingItems.value;
  }

  return apAgingItems.value.filter((item) => !item.isSettled);
});

const visibleUnsettledItems = computed(() => {
  return filteredApAgingItems.value.filter((item) => !item.isSettled);
});

const visibleUnsettledTotal = computed(() => {
  return visibleUnsettledItems.value.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0);
});

const form = reactive({
  title: "",
  amount: 0,
  notes: ""
});

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100 });
  stores.value = result.items;
  if (!selectedStoreId.value && result.items.length > 0) {
    selectedStoreId.value = result.items[0].id;
  }
}

async function loadUsersLookup() {
  const result = await getUsers({ page: 1, pageSize: 200 });
  usersById.value = result.items.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {} as Record<string, UserDto>);
}

async function loadFinance() {
  if (!selectedStoreId.value) return;
  const [sum, exp, ap, closingStatus] = await Promise.all([
    getFinanceSummary(selectedStoreId.value),
    getExpenses({
      storeId: selectedStoreId.value,
      page: page.value,
      pageSize: 10,
      search: search.value || undefined
    }),
    getApAging({
      storeId: selectedStoreId.value,
      page: 1,
      pageSize: 20
    }),
    getPeriodClosingStatus()
  ]);
  summary.value = sum;
  expenses.value = exp.items;
  pagination.value = exp.pagination;
  apAgingItems.value = ap.items;
  apAgingSummary.value = ap.summary.byBucket;
  periodClosing.value = closingStatus;
  selectedCostingMethod.value = closingStatus.inventoryCostingMethod ?? "weighted_average";

  if (!closePeriodInput.value) {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    closePeriodInput.value = local;
  }
}

async function submitExpense() {
  if (!selectedStoreId.value) return;
  submitting.value = true;
  try {
    await createExpense({
      storeId: selectedStoreId.value,
      title: form.title,
      amount: form.amount,
      notes: form.notes || undefined
    });
    form.title = "";
    form.amount = 0;
    form.notes = "";
    toast.success("Pengeluaran berhasil ditambahkan");
    await loadFinance();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menambah pengeluaran");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

async function exportExpensesCsv() {
  try {
    const exp = await getExpenses({
      storeId: selectedStoreId.value || undefined,
      page: 1,
      pageSize: 500,
      search: search.value || undefined
    });

    if (exp.items.length === 0) {
      toast.warning("Tidak ada data pengeluaran untuk diexport");
      return;
    }

    const headers = ["Waktu", "Judul", "Amount", "Catatan"];
    const rows = exp.items.map((item) => [
      new Date(item.spentAt).toLocaleString("id-ID"),
      item.title,
      Number(item.amount),
      item.notes ?? ""
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV expenses berhasil diunduh");
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal export CSV expenses"));
  }
}

async function settlePurchase(purchaseId: string) {
  const target = apAgingItems.value.find((item) => item.id === purchaseId);
  const label = target ? `${target.supplier.name} · ${target.invoiceNumber || "-"}` : purchaseId;
  const confirmed = window.confirm(`Settle hutang untuk ${label}?`);

  if (!confirmed) {
    return;
  }

  settlingIds.value = [...settlingIds.value, purchaseId];
  try {
    await settleApPurchase(purchaseId);
    toast.success("Hutang pembelian ditandai lunas");
    await loadFinance();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal settle hutang pembelian"));
  } finally {
    settlingIds.value = settlingIds.value.filter((id) => id !== purchaseId);
  }
}

async function settleAllVisible() {
  if (visibleUnsettledItems.value.length === 0) {
    toast.warning("Tidak ada hutang visible yang perlu disettle");
    return;
  }

  const confirmed = window.confirm(
    `Settle semua hutang yang terlihat sekarang (${visibleUnsettledItems.value.length} item)?`
  );

  if (!confirmed) {
    return;
  }

  settlingAll.value = true;
  try {
    for (const item of visibleUnsettledItems.value) {
      await settleApPurchase(item.id);
    }

    toast.success(`${visibleUnsettledItems.value.length} hutang visible berhasil disettle`);
    await loadFinance();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal settle semua hutang visible"));
    await loadFinance();
  } finally {
    settlingAll.value = false;
  }
}

async function submitClosePeriod() {
  if (!canClosePeriod.value) {
    toast.error("Hanya owner yang dapat menutup periode");
    return;
  }

  if (!closePeriodInput.value) {
    toast.error("Tanggal tutup periode wajib diisi");
    return;
  }

  closing.value = true;
  try {
    await closeFinancePeriod(new Date(closePeriodInput.value).toISOString());
    toast.success("Periode berhasil ditutup");
    await loadFinance();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menutup periode"));
  } finally {
    closing.value = false;
  }
}

async function submitCostingMethod() {
  if (!canClosePeriod.value) {
    toast.error("Hanya owner yang dapat mengubah metode costing");
    return;
  }

  savingCostingMethod.value = true;
  try {
    await updateInventoryCostingMethod(selectedCostingMethod.value);
    toast.success("Metode costing berhasil diperbarui");
    await loadFinance();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal memperbarui metode costing"));
  } finally {
    savingCostingMethod.value = false;
  }
}

watch(selectedStoreId, () => {
  page.value = 1;
  void loadFinance();
});

onMounted(async () => {
  try {
    await Promise.all([loadStores(), loadUsersLookup()]);
    await loadFinance();

    autoRefreshTimer.value = window.setInterval(() => {
      void loadFinance();
    }, 30_000);
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat finance");
  }
});

onBeforeUnmount(() => {
  if (autoRefreshTimer.value) {
    window.clearInterval(autoRefreshTimer.value);
    autoRefreshTimer.value = null;
  }
});

function toRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function isSettling(purchaseId: string) {
  return settlingIds.value.includes(purchaseId);
}

function closingActorName(userId: string) {
  const user = usersById.value[userId];
  if (!user) {
    return userId;
  }

  return `${user.fullName} (${user.role})`;
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadFinance();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadFinance();
  }
}
</script>

<template>
  <section>
    <PageHeader title="Finance Data Management">
      <template #right>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="exportExpensesCsv"
        >
          Export CSV
        </button>
      </template>
    </PageHeader>

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-3">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <input v-model="form.title" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Judul pengeluaran" />
      <input v-model.number="form.amount" type="number" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Amount" />
      <input v-model="form.notes" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Catatan" />
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        @click="submitExpense"
      >
        Tambah Pengeluaran
      </LoadingButton>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari pengeluaran" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadFinance">Filter</button>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 grid gap-3 md:grid-cols-3">
      <article class="card">
        <p class="text-xs text-slate-500">Omzet Harian</p>
        <p class="mt-2 text-xl font-bold text-slate-900">{{ toRupiah(summary.salesTotal) }}</p>
      </article>
      <article class="card">
        <p class="text-xs text-slate-500">Pengeluaran Harian</p>
        <p class="mt-2 text-xl font-bold text-slate-900">{{ toRupiah(summary.expenseTotal) }}</p>
      </article>
      <article class="card">
        <p class="text-xs text-slate-500">Estimasi Laba Kotor</p>
        <p class="mt-2 text-xl font-bold text-slate-900">{{ toRupiah(summary.grossProfitEstimate) }}</p>
      </article>
    </div>

    <div class="mt-4 card">
      <h2 class="card-title">Pengeluaran Hari Ini</h2>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="expense in expenses" :key="expense.id" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span>{{ expense.title }}</span>
          <strong>{{ toRupiah(Number(expense.amount)) }}</strong>
        </li>
      </ul>
    </div>

    <div class="mt-4 card">
      <h2 class="card-title">AP Aging</h2>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <label class="inline-flex items-center gap-2 text-sm text-slate-700">
          <input v-model="showUnsettledOnly" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
          Unsettled only
        </label>
        <p class="text-xs text-slate-600">
          Visible outstanding: <strong class="text-slate-800">{{ toRupiah(visibleUnsettledTotal) }}</strong>
        </p>
        <span
          class="rounded px-2 py-1 text-xs font-medium"
          :class="visibleUnsettledItems.length === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'"
        >
          {{ visibleUnsettledItems.length }} items
        </span>
        <LoadingButton
          :loading="settlingAll"
          loading-text="Settling..."
          class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="visibleUnsettledItems.length === 0"
          @click="settleAllVisible"
        >
          Settle All Visible
        </LoadingButton>
      </div>
      <div class="mt-3 grid gap-2 text-sm md:grid-cols-4">
        <div class="rounded-lg bg-slate-50 px-3 py-2">0-30: <strong>{{ toRupiah(apAgingSummary["0-30"]) }}</strong></div>
        <div class="rounded-lg bg-slate-50 px-3 py-2">31-60: <strong>{{ toRupiah(apAgingSummary["31-60"]) }}</strong></div>
        <div class="rounded-lg bg-slate-50 px-3 py-2">61-90: <strong>{{ toRupiah(apAgingSummary["61-90"]) }}</strong></div>
        <div class="rounded-lg bg-slate-50 px-3 py-2">>90: <strong>{{ toRupiah(apAgingSummary[">90"]) }}</strong></div>
      </div>

      <div class="mt-3 space-y-2 text-sm">
        <p v-if="filteredApAgingItems.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
          Tidak ada item AP aging untuk filter ini.
        </p>
        <div
          v-for="item in filteredApAgingItems"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
        >
          <div class="min-w-0">
            <p class="font-medium text-slate-800">{{ item.supplier.name }} · {{ item.invoiceNumber || "-" }}</p>
            <p class="text-xs text-slate-500">Aging {{ item.ageDays }} hari · Bucket {{ item.bucket }}</p>
          </div>
          <div class="flex items-center gap-2">
            <strong class="text-slate-900">{{ toRupiah(item.outstandingAmount) }}</strong>
            <LoadingButton
              v-if="!item.isSettled"
              :loading="isSettling(item.id)"
              loading-text="Settle..."
              class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
              @click="settlePurchase(item.id)"
            >
              Settle
            </LoadingButton>
            <span v-else class="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">Settled</span>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 card">
      <h2 class="card-title">Period Closing</h2>
      <p class="mt-2 text-sm text-slate-600">
        Closed through: <strong>{{ periodClosing.closedThroughAt ? new Date(periodClosing.closedThroughAt).toLocaleString("id-ID") : "Belum ada" }}</strong>
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <select
          v-model="selectedCostingMethod"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          :disabled="!canClosePeriod"
        >
          <option value="weighted_average">Weighted Average</option>
          <option value="fifo">FIFO</option>
        </select>
        <LoadingButton
          :loading="savingCostingMethod"
          loading-text="Menyimpan..."
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="!canClosePeriod"
          @click="submitCostingMethod"
        >
          Simpan Metode Costing
        </LoadingButton>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input
          v-model="closePeriodInput"
          type="datetime-local"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          :disabled="!canClosePeriod"
        />
        <LoadingButton
          :loading="closing"
          loading-text="Closing..."
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="!canClosePeriod"
          @click="submitClosePeriod"
        >
          Close Period
        </LoadingButton>
      </div>
      <p v-if="!canClosePeriod" class="mt-2 text-xs text-amber-600">Hanya owner yang dapat menutup periode.</p>

      <div class="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-slate-600">
            <tr>
              <th class="px-3 py-2 text-left font-medium">Closed At</th>
              <th class="px-3 py-2 text-left font-medium">Closed Through</th>
              <th class="px-3 py-2 text-left font-medium">By User</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodClosing.closureHistory.length === 0">
              <td colspan="3" class="px-3 py-3 text-center text-slate-500">Belum ada riwayat closing period</td>
            </tr>
            <tr
              v-for="item in periodClosing.closureHistory"
              :key="`${item.closedAt}-${item.closedByUserId}`"
              class="border-t border-slate-100"
            >
              <td class="px-3 py-2 text-slate-700">{{ new Date(item.closedAt).toLocaleString("id-ID") }}</td>
              <td class="px-3 py-2 text-slate-700">{{ new Date(item.closedThroughAt).toLocaleString("id-ID") }}</td>
              <td class="px-3 py-2 text-slate-700">{{ closingActorName(item.closedByUserId) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>
  </section>
</template>
