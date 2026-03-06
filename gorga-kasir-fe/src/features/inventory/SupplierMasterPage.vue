<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { createSupplier, getSuppliers, type SupplierDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const suppliers = ref<SupplierDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const search = ref("");
const isActiveOnly = ref(true);
const toast = useToast();

const form = reactive({
  name: "",
  phone: "",
  address: ""
});

const filteredSuppliers = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) {
    return suppliers.value;
  }
  return suppliers.value.filter((item) => (`${item.name} ${item.phone ?? ""}`).toLowerCase().includes(keyword));
});

async function loadSuppliers() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getSuppliers({ page: 1, pageSize: 200, isActive: isActiveOnly.value || undefined });
    suppliers.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data supplier");
  } finally {
    loading.value = false;
  }
}

async function submitSupplier() {
  const name = form.name.trim();
  if (!name) {
    toast.warning("Nama supplier wajib diisi");
    return;
  }

  submitting.value = true;
  try {
    await createSupplier({
      name,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      isActive: true
    });
    form.name = "";
    form.phone = "";
    form.address = "";
    toast.success("Supplier berhasil ditambahkan");
    await loadSuppliers();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menambahkan supplier"));
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadSuppliers();
});
</script>

<template>
  <section>
    <PageHeader title="Supplier Master" subtitle="Kelola supplier untuk dipilih lewat LOV di purchase dan inventory." />

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">Tambah Supplier</h2>
      <div class="mt-3 grid gap-2 md:grid-cols-3">
        <input v-model="form.name" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama supplier" />
        <input v-model="form.phone" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="No HP (opsional)" />
        <input v-model="form.address" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Alamat (opsional)" />
      </div>
      <div class="mt-3 flex justify-end">
        <LoadingButton
          :loading="submitting"
          loading-text="Menyimpan..."
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          @click="submitSupplier"
        >
          Simpan Supplier
        </LoadingButton>
      </div>
    </article>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Daftar Supplier</h2>
        <div class="flex gap-2">
          <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari supplier..." />
          <label class="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input v-model="isActiveOnly" type="checkbox" @change="loadSuppliers" />
            Active only
          </label>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadSuppliers">Refresh</button>
        </div>
      </div>

      <PageErrorAlert :message="error" class="mt-2" />

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Nama</th>
              <th class="px-3 py-2">Phone</th>
              <th class="px-3 py-2">Alamat</th>
              <th class="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="item in filteredSuppliers" :key="item.id">
              <td class="px-3 py-2">{{ item.name }}</td>
              <td class="px-3 py-2">{{ item.phone || '-' }}</td>
              <td class="px-3 py-2">{{ item.address || '-' }}</td>
              <td class="px-3 py-2">{{ item.isActive ? 'Active' : 'Inactive' }}</td>
            </tr>
            <tr v-if="!loading && filteredSuppliers.length === 0">
              <td colspan="4" class="px-3 py-4 text-center text-slate-500">Data supplier belum ada</td>
            </tr>
            <tr v-if="loading">
              <td colspan="4" class="px-3 py-4 text-center text-slate-500">Loading...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>
</template>
