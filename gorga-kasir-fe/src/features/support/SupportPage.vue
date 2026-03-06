<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageFilterBar from "@/components/PageFilterBar.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { createTicket, getStores, getTickets, updateTicketStatus, type StoreDto, type TicketDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const tickets = ref<TicketDto[]>([]);
const error = ref("");
const submitting = ref(false);
const updatingTicketId = ref("");
const toast = useToast();
const search = ref("");
const statusFilter = ref("");
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

const form = reactive({
  title: "",
  description: "",
  priority: "normal"
});

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100 });
  stores.value = result.items;
  if (!selectedStoreId.value && result.items.length > 0) {
    selectedStoreId.value = result.items[0].id;
  }
}

async function loadTickets() {
  if (!selectedStoreId.value) return;
  const result = await getTickets({
    storeId: selectedStoreId.value,
    page: page.value,
    pageSize: 10,
    search: search.value || undefined,
    status: statusFilter.value || undefined
  });
  tickets.value = result.items;
  pagination.value = result.pagination;
}

async function submitTicket() {
  if (!selectedStoreId.value) return;
  submitting.value = true;
  try {
    await createTicket({
      storeId: selectedStoreId.value,
      title: form.title,
      description: form.description,
      priority: form.priority
    });
    form.title = "";
    form.description = "";
    form.priority = "normal";
    toast.success("Tiket berhasil dibuat");
    await loadTickets();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal membuat tiket");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

async function setStatus(ticket: TicketDto, status: "open" | "in_progress" | "resolved") {
  updatingTicketId.value = ticket.id;
  try {
    await updateTicketStatus(ticket.id, status);
    toast.success("Status tiket diperbarui");
    await loadTickets();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal update status tiket");
    toast.error(error.value);
  } finally {
    updatingTicketId.value = "";
  }
}

watch(selectedStoreId, () => {
  page.value = 1;
  void loadTickets();
});

onMounted(async () => {
  try {
    await loadStores();
    await loadTickets();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat support");
  }
});

function statusClass(status: string) {
  if (status === "open") return "bg-red-100 text-red-700";
  if (status === "in_progress") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadTickets();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadTickets();
  }
}
</script>

<template>
  <section>
    <PageHeader title="Customer Support Management (Internal)">
      <template #right>
        <span class="text-xs text-slate-500">{{ pagination.total }} tiket</span>
      </template>
    </PageHeader>

    <PageFilterBar>
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari tiket" />
      <select v-model="statusFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">all status</option>
        <option value="open">open</option>
        <option value="in_progress">in_progress</option>
        <option value="resolved">resolved</option>
      </select>
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadTickets">Filter</button>
    </PageFilterBar>

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-3">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <input v-model="form.title" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Judul tiket" />
      <select v-model="form.priority" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="low">low</option>
        <option value="normal">normal</option>
        <option value="high">high</option>
      </select>
      <input v-model="form.description" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Deskripsi" />
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        @click="submitTicket"
      >
        Buat Tiket
      </LoadingButton>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 space-y-3">
      <article v-for="ticket in tickets" :key="ticket.id" class="card">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-medium text-slate-900">{{ ticket.title }}</h3>
            <p class="mt-1 text-xs uppercase text-slate-500">Priority: {{ ticket.priority }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full px-2 py-1 text-xs" :class="statusClass(ticket.status)">{{ ticket.status }}</span>
            <select
              :disabled="updatingTicketId === ticket.id"
              class="rounded border border-slate-300 px-2 py-1 text-xs"
              :value="ticket.status"
              @change="setStatus(ticket, ($event.target as HTMLSelectElement).value as 'open' | 'in_progress' | 'resolved')"
            >
              <option value="open">open</option>
              <option value="in_progress">in_progress</option>
              <option value="resolved">resolved</option>
            </select>
          </div>
        </div>
      </article>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>
  </section>
</template>
