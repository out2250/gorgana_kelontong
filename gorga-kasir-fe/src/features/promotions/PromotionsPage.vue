<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { createPromo, getPromos, updatePromoStatus, type PromoDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const items = ref<PromoDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const search = ref("");
const toast = useToast();

const form = reactive({
  code: "",
  name: "",
  description: "",
  discountPercent: 10,
  category: "",
  startAt: "",
  endAt: "",
  isActive: true
});

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getPromos({ search: search.value || undefined });
    items.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat promo");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function submitPromo() {
  submitting.value = true;
  error.value = "";
  try {
    await createPromo({
      code: form.code.trim().toUpperCase(),
      name: form.name,
      description: form.description || undefined,
      discountPercent: Number(form.discountPercent),
      category: form.category || undefined,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      isActive: form.isActive
    });

    form.code = "";
    form.name = "";
    form.description = "";
    form.discountPercent = 10;
    form.category = "";
    form.startAt = "";
    form.endAt = "";
    form.isActive = true;

    toast.success("Promo berhasil dibuat");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal membuat promo");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

async function togglePromo(item: PromoDto) {
  try {
    await updatePromoStatus(item.id, !item.isActive);
    toast.success("Status promo diperbarui");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal mengubah status promo");
    toast.error(error.value);
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Promo Management" subtitle="Setup promo berdasarkan kode, periode, diskon, dan kategori produk." />

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
      <input v-model="form.code" class="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" placeholder="Code (contoh: WEEKEND15)" />
      <input v-model="form.name" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama promo" />
      <input v-model.number="form.discountPercent" type="number" min="1" max="100" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Diskon %" />
      <input v-model="form.category" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Kategori (opsional)" />
      <input v-model="form.description" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Deskripsi promo" />
      <input v-model="form.startAt" type="datetime-local" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input v-model="form.endAt" type="datetime-local" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <label class="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <input v-model="form.isActive" type="checkbox" />
        Active
      </label>
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white md:col-span-4"
        @click="submitPromo"
      >
        Simpan Promo
      </LoadingButton>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari promo by code/nama" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadData">Cari</button>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Nama</th>
            <th class="px-4 py-3">Diskon</th>
            <th class="px-4 py-3">Kategori</th>
            <th class="px-4 py-3">Periode</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3 font-medium text-slate-900">{{ item.code }}</td>
            <td class="px-4 py-3 text-slate-700">{{ item.name }}</td>
            <td class="px-4 py-3 text-slate-700">{{ item.discountPercent }}%</td>
            <td class="px-4 py-3 text-slate-700">{{ item.category || '-' }}</td>
            <td class="px-4 py-3 text-slate-600">{{ new Date(item.startAt).toLocaleString('id-ID') }} - {{ new Date(item.endAt).toLocaleString('id-ID') }}</td>
            <td class="px-4 py-3">
              <span class="rounded px-2 py-1 text-xs" :class="item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'">
                {{ item.isActive ? 'active' : 'inactive' }}
              </span>
            </td>
            <td class="px-4 py-3">
              <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="togglePromo(item)">
                {{ item.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
              </button>
            </td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="7" class="px-4 py-6 text-center text-slate-500">Belum ada promo.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
