<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { createCategory, getCategories, type CategoryDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const categories = ref<CategoryDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const search = ref("");
const isActiveOnly = ref(true);
const toast = useToast();

const form = reactive({
  name: "",
  parentId: ""
});

const filteredCategories = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) {
    return categories.value;
  }
  return categories.value.filter((item) => item.name.toLowerCase().includes(keyword));
});

async function loadCategories() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getCategories({ page: 1, pageSize: 200, isActive: isActiveOnly.value || undefined });
    categories.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data kategori");
  } finally {
    loading.value = false;
  }
}

async function submitCategory() {
  const name = form.name.trim();
  if (!name) {
    toast.warning("Nama kategori wajib diisi");
    return;
  }

  submitting.value = true;
  try {
    await createCategory({
      name,
      parentId: form.parentId || undefined,
      isActive: true
    });
    form.name = "";
    form.parentId = "";
    toast.success("Kategori berhasil ditambahkan");
    await loadCategories();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menambahkan kategori"));
  } finally {
    submitting.value = false;
  }
}

function getParentName(item: CategoryDto) {
  if (!item.parentId) {
    return "-";
  }
  return categories.value.find((candidate) => candidate.id === item.parentId)?.name ?? "-";
}

onMounted(() => {
  void loadCategories();
});
</script>

<template>
  <section>
    <PageHeader title="Category Master" subtitle="Kelola kategori master untuk klasifikasi produk." />

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">Tambah Kategori</h2>
      <div class="mt-3 grid gap-2 md:grid-cols-3">
        <input v-model="form.name" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama kategori" />
        <select v-model="form.parentId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Tanpa parent</option>
          <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <div class="flex justify-end md:justify-start">
          <LoadingButton
            :loading="submitting"
            loading-text="Menyimpan..."
            class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            @click="submitCategory"
          >
            Simpan Kategori
          </LoadingButton>
        </div>
      </div>
    </article>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Daftar Kategori</h2>
        <div class="flex gap-2">
          <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari kategori..." />
          <label class="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input v-model="isActiveOnly" type="checkbox" @change="loadCategories" />
            Active only
          </label>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadCategories">Refresh</button>
        </div>
      </div>

      <PageErrorAlert :message="error" class="mt-2" />

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Nama</th>
              <th class="px-3 py-2">Parent</th>
              <th class="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="item in filteredCategories" :key="item.id">
              <td class="px-3 py-2">{{ item.name }}</td>
              <td class="px-3 py-2">{{ getParentName(item) }}</td>
              <td class="px-3 py-2">{{ item.isActive ? 'Active' : 'Inactive' }}</td>
            </tr>
            <tr v-if="!loading && filteredCategories.length === 0">
              <td colspan="3" class="px-3 py-4 text-center text-slate-500">Data kategori belum ada</td>
            </tr>
            <tr v-if="loading">
              <td colspan="3" class="px-3 py-4 text-center text-slate-500">Loading...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
