<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  approveStockOpnameSession,
  assignStockOpnameSession,
  createStockOpnameSession,
  getProducts,
  getStockOpnameSessionDetail,
  getStockOpnameSessions,
  getStores,
  getUsers,
  saveStockOpnameItems,
  submitStockOpnameSession,
  type ProductDto,
  type StockOpnameDetailDto,
  type StockOpnameSessionDto,
  type StoreDto,
  type UserDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/services/toast";

const auth = useAuthStore();
const toast = useToast();
const SESSION_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const sessions = ref<StockOpnameSessionDto[]>([]);
const users = ref<UserDto[]>([]);
const selectedSessionId = ref("");
const sessionDetail = ref<StockOpnameDetailDto | null>(null);
const products = ref<ProductDto[]>([]);
const countedMap = reactive<Record<string, number>>({});
const statusFilter = ref<"" | "open" | "submitted" | "approved" | "rejected">("");
const sessionIdFilter = ref("");
const startDate = ref("");
const endDate = ref("");
const sessionPage = ref(1);
const sessionPageSize = ref<(typeof SESSION_PAGE_SIZE_OPTIONS)[number]>(20);
const sessionsPagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 1 });

const creatingSession = ref(false);
const savingItems = ref(false);
const submittingSession = ref(false);
const approvingSession = ref(false);
const assigningSession = ref(false);
const exportingCsv = ref(false);
const loading = ref(false);
const error = ref("");

const createForm = reactive({
  assignedTo: "",
  notes: ""
});

const assignForm = reactive({
  assignedTo: ""
});

const canApprove = computed(() => {
  return Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner" || auth.user?.role === "manager");
});

const canLoadUsers = computed(() => {
  return Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner" || auth.user?.role === "manager");
});

const isSessionOpen = computed(() => sessionDetail.value?.status === "open");
const isSessionSubmitted = computed(() => sessionDetail.value?.status === "submitted");

const productRows = computed(() => {
  return products.value.map((product) => {
    const counted = countedMap[product.id] ?? product.stockOnHand;
    const difference = counted - product.stockOnHand;
    return {
      ...product,
      counted,
      difference
    };
  });
});

function toRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID");
}

function toStartOfDayIso(dateValue?: string) {
  return dateValue ? `${dateValue}T00:00:00.000Z` : undefined;
}

function toEndOfDayIso(dateValue?: string) {
  return dateValue ? `${dateValue}T23:59:59.999Z` : undefined;
}

function getSessionFilters(page = sessionPage.value, pageSize: number = sessionPageSize.value) {
  return {
    page,
    pageSize,
    sessionId: sessionIdFilter.value || undefined,
    storeId: selectedStoreId.value || undefined,
    status: statusFilter.value || undefined,
    startDate: toStartOfDayIso(startDate.value),
    endDate: toEndOfDayIso(endDate.value)
  };
}

function normalizeCountedStock(rawValue: unknown, fallback: number) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(fallback));
  }

  return Math.max(0, Math.floor(numeric));
}

async function loadUsers() {
  if (!canLoadUsers.value) {
    users.value = [];
    createForm.assignedTo = "";
    assignForm.assignedTo = "";
    return;
  }

  const result = await getUsers({
    page: 1,
    pageSize: 200,
    storeId: selectedStoreId.value || undefined,
    isActive: true
  });
  users.value = result.items;
  if (!createForm.assignedTo && result.items.length > 0) {
    createForm.assignedTo = result.items[0].id;
  }
}

function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100, isActive: true });
  stores.value = result.items;
  if (!selectedStoreId.value && stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
  }
}

async function loadSessions() {
  if (!selectedStoreId.value) {
    sessions.value = [];
    sessionsPagination.value = { page: 1, pageSize: sessionPageSize.value, total: 0, totalPages: 1 };
    return;
  }

  const result = await getStockOpnameSessions(getSessionFilters());

  sessions.value = result.items;
  sessionsPagination.value = result.pagination;

  if (!selectedSessionId.value && sessions.value.length > 0) {
    selectedSessionId.value = sessions.value[0].id;
    return;
  }

  if (selectedSessionId.value && !sessions.value.some((session) => session.id === selectedSessionId.value)) {
    selectedSessionId.value = sessions.value[0]?.id ?? "";
  }
}

async function loadProducts() {
  if (!selectedStoreId.value) {
    products.value = [];
    return;
  }

  const result = await getProducts({
    storeId: selectedStoreId.value,
    page: 1,
    pageSize: 500
  });

  products.value = result.items;
}

async function loadSessionDetail() {
  if (!selectedSessionId.value) {
    sessionDetail.value = null;
    return;
  }

  const detail = await getStockOpnameSessionDetail(selectedSessionId.value);
  sessionDetail.value = detail;

  Object.keys(countedMap).forEach((key) => {
    delete countedMap[key];
  });

  const detailMap = new Map(detail.items.map((item) => [item.productId, item.countedStock]));

  for (const product of products.value) {
    countedMap[product.id] = detailMap.get(product.id) ?? product.stockOnHand;
  }
}

async function refreshAll() {
  loading.value = true;
  error.value = "";
  try {
    await loadProducts();
    await loadUsers();
    await loadSessions();
    if (selectedSessionId.value) {
      await loadSessionDetail();
    }
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data stock opname");
  } finally {
    loading.value = false;
  }
}

async function createSession() {
  if (!selectedStoreId.value) {
    toast.warning("Pilih store dulu");
    return;
  }

  creatingSession.value = true;
  try {
    const created = await createStockOpnameSession({
      storeId: selectedStoreId.value,
      assignedTo: createForm.assignedTo || undefined,
      notes: createForm.notes.trim() || undefined
    });

    createForm.notes = "";
    selectedSessionId.value = created.id;
    toast.success("Sesi stock opname berhasil dibuat");
    await refreshAll();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal membuat sesi stock opname");
    error.value = message;
    toast.error(message);
  } finally {
    creatingSession.value = false;
  }
}

async function assignSession() {
  if (!selectedSessionId.value || !assignForm.assignedTo) {
    toast.warning("Pilih sesi dan user assign");
    return;
  }

  assigningSession.value = true;
  try {
    await assignStockOpnameSession(selectedSessionId.value, assignForm.assignedTo);
    toast.success("Assign sesi berhasil disimpan");
    await refreshAll();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal assign sesi stock opname");
    error.value = message;
    toast.error(message);
  } finally {
    assigningSession.value = false;
  }
}

async function saveCounts() {
  if (!selectedSessionId.value) {
    toast.warning("Pilih sesi dulu");
    return;
  }

  if (!isSessionOpen.value) {
    toast.warning("Sesi tidak bisa diedit");
    return;
  }

  savingItems.value = true;
  try {
    const outlier = productRows.value.find((row) => {
      const maxAllowed = Math.max(row.stockOnHand * 3, 5000);
      return normalizeCountedStock(countedMap[row.id], row.stockOnHand) > maxAllowed;
    });

    if (outlier) {
      toast.error(`Counted ${outlier.name} terlalu jauh dari stok sistem, mohon cek ulang`);
      return;
    }

    await saveStockOpnameItems({
      sessionId: selectedSessionId.value,
      items: productRows.value.map((row) => ({
        productId: row.id,
        countedStock: normalizeCountedStock(countedMap[row.id], row.stockOnHand)
      }))
    });

    toast.success("Count stock berhasil disimpan");
    await loadSessionDetail();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal menyimpan count stock");
    error.value = message;
    toast.error(message);
  } finally {
    savingItems.value = false;
  }
}

async function submitSession() {
  if (!selectedSessionId.value) {
    return;
  }

  submittingSession.value = true;
  try {
    await submitStockOpnameSession(selectedSessionId.value);
    toast.success("Sesi stock opname berhasil disubmit");
    await refreshAll();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal submit sesi stock opname");
    error.value = message;
    toast.error(message);
  } finally {
    submittingSession.value = false;
  }
}

async function approveSession() {
  if (!selectedSessionId.value) {
    return;
  }

  approvingSession.value = true;
  try {
    await approveStockOpnameSession(selectedSessionId.value);
    toast.success("Sesi stock opname berhasil di-approve");
    await refreshAll();
  } catch (err) {
    const message = getErrorMessage(err, "Gagal approve sesi stock opname");
    error.value = message;
    toast.error(message);
  } finally {
    approvingSession.value = false;
  }
}

async function exportSessionsCsv() {
  exportingCsv.value = true;
  try {
    const result = await getStockOpnameSessions(getSessionFilters(1, 500));

    if (result.items.length === 0) {
      toast.warning("Tidak ada sesi stock opname untuk diexport");
      return;
    }

    const headers = ["Waktu Dibuat", "Store", "Dibuat Oleh", "Status", "Waktu Approve", "Diapprove Oleh", "Catatan"];
    const rows = result.items.map((item) => [
      formatDate(item.createdAt),
      item.store.name,
      item.creator.fullName,
      item.status,
      item.approvedAt ? formatDate(item.approvedAt) : "",
      item.approver?.fullName ?? "",
      item.notes ?? ""
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadCsvFile(csv, `stock-opname-${new Date().toISOString().slice(0, 10)}.csv`);

    toast.success("CSV stock opname berhasil diunduh");
  } catch (err) {
    const message = getErrorMessage(err, "Gagal export CSV stock opname");
    error.value = message;
    toast.error(message);
  } finally {
    exportingCsv.value = false;
  }
}

async function applyFilters() {
  sessionPage.value = 1;
  selectedSessionId.value = "";
  await refreshAll();
}

async function changeSessionPageSize() {
  sessionPage.value = 1;
  selectedSessionId.value = "";
  await refreshAll();
}

async function nextSessionPage() {
  if (sessionsPagination.value.page >= sessionsPagination.value.totalPages) {
    return;
  }

  sessionPage.value += 1;
  selectedSessionId.value = "";
  await refreshAll();
}

async function prevSessionPage() {
  if (sessionsPagination.value.page <= 1) {
    return;
  }

  sessionPage.value -= 1;
  selectedSessionId.value = "";
  await refreshAll();
}

watch(selectedStoreId, () => {
  sessionPage.value = 1;
  selectedSessionId.value = "";
  createForm.assignedTo = "";
  assignForm.assignedTo = "";
  void refreshAll();
});

watch(selectedSessionId, () => {
  const selected = sessions.value.find((session) => session.id === selectedSessionId.value);
  assignForm.assignedTo = selected?.assignedTo ?? "";
  void loadSessionDetail();
});

onMounted(async () => {
  try {
    await loadStores();
    await refreshAll();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat halaman stock opname");
  }
});
</script>

<template>
  <section>
    <PageHeader title="Stock Opname" subtitle="Sesi opname, selisih stok, dan approval adjustment.">
      <template #right>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="exportingCsv"
          @click="exportSessionsCsv"
        >
          {{ exportingCsv ? "Export..." : "Export CSV" }}
        </button>
      </template>
    </PageHeader>

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <select v-model="createForm.assignedTo" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Tanpa assignee</option>
        <option v-for="user in users" :key="user.id" :value="user.id">{{ user.fullName }} ({{ user.role }})</option>
      </select>
      <input v-model="createForm.notes" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Catatan sesi (opsional)" />
      <LoadingButton
        :loading="creatingSession"
        loading-text="Membuat..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white md:col-span-4"
        @click="createSession"
      >
        Buat Sesi
      </LoadingButton>
    </div>

    <div class="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4">
      <input v-model="sessionIdFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Filter by Session ID" />
      <select v-model="statusFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">Semua Status</option>
        <option value="open">open</option>
        <option value="submitted">submitted</option>
        <option value="approved">approved</option>
        <option value="rejected">rejected</option>
      </select>
      <input v-model="startDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input v-model="endDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-4" @click="applyFilters">Filter Histori</button>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 grid gap-3 lg:grid-cols-[320px_1fr]">
      <article class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Daftar Sesi</h2>
            <p class="mt-1 text-xs text-slate-500">
              {{ loading ? "Loading..." : `${sessionsPagination.total} total • halaman ${sessionsPagination.page}/${sessionsPagination.totalPages}` }}
            </p>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500">Per page</span>
            <select v-model.number="sessionPageSize" class="rounded border border-slate-300 px-2 py-1" @change="changeSessionPageSize">
              <option v-for="size in SESSION_PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
            </select>
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <button
            v-for="session in sessions"
            :key="session.id"
            class="w-full rounded-lg border px-3 py-2 text-left text-xs"
            :class="selectedSessionId === session.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'"
            @click="selectedSessionId = session.id"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-slate-900">{{ session.id.slice(0, 8) }} • {{ formatDate(session.createdAt) }}</span>
              <span class="rounded-full px-2 py-0.5 text-[10px]"
                :class="session.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : session.status === 'submitted' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'"
              >
                {{ session.status }}
              </span>
            </div>
            <p class="mt-1 text-[11px] text-slate-500">Session ID: {{ session.id }}</p>
            <p class="mt-1 text-slate-600">{{ session.notes || '-' }}</p>
          </button>
          <p v-if="sessions.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Belum ada sesi opname.</p>
        </div>

        <div class="mt-3 flex items-center justify-between text-xs text-slate-600">
          <button class="rounded border border-slate-300 px-2 py-1 disabled:opacity-50" :disabled="sessionsPagination.page <= 1 || loading" @click="prevSessionPage">
            Prev
          </button>
          <span>{{ sessionsPagination.page }} / {{ sessionsPagination.totalPages }}</span>
          <button
            class="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            :disabled="sessionsPagination.page >= sessionsPagination.totalPages || loading"
            @click="nextSessionPage"
          >
            Next
          </button>
        </div>
      </article>

      <article class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Detail Sesi</h2>
            <p class="text-xs text-slate-500">{{ sessionDetail ? `Status: ${sessionDetail.status}` : 'Pilih sesi untuk mulai opname.' }}</p>
            <div v-if="sessionDetail" class="mt-1 text-[11px] text-slate-500">
              <p>ID: {{ sessionDetail.id }}</p>
              <p>Create: {{ sessionDetail.creator.fullName }}</p>
              <p>Assigned To: {{ sessionDetail.assignee?.fullName || '-' }}</p>
              <p>Assigned By: {{ sessionDetail.assigner?.fullName || '-' }}</p>
              <p>Approved By: {{ sessionDetail.approver?.fullName || '-' }}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="assignForm.assignedTo"
              class="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              :disabled="!sessionDetail || !isSessionOpen || !(auth.user?.isSuperAdmin || auth.user?.role === 'owner' || auth.user?.role === 'manager')"
            >
              <option value="">Pilih assignee</option>
              <option v-for="user in users" :key="user.id" :value="user.id">{{ user.fullName }}</option>
            </select>
            <LoadingButton
              :loading="assigningSession"
              :disabled="!sessionDetail || !isSessionOpen || !assignForm.assignedTo || !(auth.user?.isSuperAdmin || auth.user?.role === 'owner' || auth.user?.role === 'manager')"
              loading-text="Assign..."
              class="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700"
              @click="assignSession"
            >
              Assign Sesi
            </LoadingButton>
            <LoadingButton
              :loading="savingItems"
              :disabled="!sessionDetail || !isSessionOpen"
              loading-text="Menyimpan..."
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              @click="saveCounts"
            >
              Simpan Count
            </LoadingButton>
            <LoadingButton
              :loading="submittingSession"
              :disabled="!sessionDetail || !isSessionOpen"
              loading-text="Submit..."
              class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
              @click="submitSession"
            >
              Submit Sesi
            </LoadingButton>
            <LoadingButton
              :loading="approvingSession"
              :disabled="!sessionDetail || !isSessionSubmitted || !canApprove"
              loading-text="Approve..."
              class="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
              @click="approveSession"
            >
              Approve Adjustment
            </LoadingButton>
          </div>
        </div>

        <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-3 py-2">Produk</th>
                <th class="px-3 py-2">Sistem</th>
                <th class="px-3 py-2">Counted</th>
                <th class="px-3 py-2">Selisih</th>
                <th class="px-3 py-2">Harga Jual</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="row in productRows" :key="row.id">
                <td class="px-3 py-2 text-slate-900">{{ row.name }}</td>
                <td class="px-3 py-2">{{ row.stockOnHand }}</td>
                <td class="px-3 py-2">
                  <input
                    v-model.number="countedMap[row.id]"
                    type="number"
                    min="0"
                    class="w-24 rounded border border-slate-300 px-2 py-1"
                    :disabled="!isSessionOpen"
                  />
                </td>
                <td class="px-3 py-2" :class="row.difference === 0 ? 'text-slate-600' : row.difference < 0 ? 'text-rose-700' : 'text-emerald-700'">
                  {{ row.difference > 0 ? `+${row.difference}` : row.difference }}
                </td>
                <td class="px-3 py-2">{{ toRupiah(Number(row.sellPrice)) }}</td>
              </tr>
              <tr v-if="productRows.length === 0">
                <td colspan="5" class="px-3 py-4 text-center text-slate-500">Belum ada produk untuk store ini.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>
