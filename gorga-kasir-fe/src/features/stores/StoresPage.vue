<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageFilterBar from "@/components/PageFilterBar.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { createStore, getStores, type StoreDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const stores = ref<StoreDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const toast = useToast();
const search = ref("");
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const form = reactive({
  name: "",
  address: ""
});

async function loadStores() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getStores({
      page: page.value,
      pageSize: 10,
      search: search.value || undefined
    });
    stores.value = result.items;
    pagination.value = result.pagination;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat store");
  } finally {
    loading.value = false;
  }
}

async function submitStore() {
  submitting.value = true;
  try {
    await createStore({
      name: form.name,
      address: form.address || undefined
    });

    form.name = "";
    form.address = "";
    toast.success("Store berhasil ditambahkan");
    await loadStores();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menambah store");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadStores();
});

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadStores();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadStores();
  }
}
</script>

<template>
  <section>
    <PageHeader title="Kelontong Management">
      <template #right>
        <span class="text-xs text-slate-500">{{ loading ? "Loading..." : `${pagination.total} store` }}</span>
      </template>
    </PageHeader>

    <PageFilterBar>
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari store" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadStores">Filter</button>
    </PageFilterBar>

    <form class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-3" @submit.prevent="submitStore">
      <input v-model="form.name" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama store" required />
      <input v-model="form.address" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Alamat" />
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Tambah Store
      </LoadingButton>
    </form>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <article v-for="store in stores" :key="store.id" class="card">
        <h3 class="card-title">{{ store.name }}</h3>
        <p class="mt-1 text-sm text-slate-600">{{ store.address || "-" }}</p>
        <div class="mt-3">
          <span class="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{{ store.isActive ? "active" : "inactive" }}</span>
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
