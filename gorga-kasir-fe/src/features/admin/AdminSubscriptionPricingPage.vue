<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  getSubscriptionPricingSettings,
  updateSubscriptionPricingSettings,
  type SubscriptionPricingPackage
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const toast = useToast();

const form = reactive({
  baseMonthlyPrice: 150000,
  promoNote: "",
  packages: [] as SubscriptionPricingPackage[]
});

function createPackage(): SubscriptionPricingPackage {
  const index = form.packages.length + 1;
  return {
    id: `package_${Date.now()}_${index}`,
    label: `Paket ${index}`,
    months: 1,
    discountPercent: 0,
    freeMonths: 0,
    isActive: true
  };
}

function addPackage() {
  form.packages.push(createPackage());
}

function removePackage(id: string) {
  if (form.packages.length <= 1) {
    toast.warning("Minimal harus ada 1 paket");
    return;
  }
  form.packages = form.packages.filter((item) => item.id !== id);
}

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const data = await getSubscriptionPricingSettings();
    form.baseMonthlyPrice = data.baseMonthlyPrice;
    form.promoNote = data.promoNote ?? "";
    form.packages = data.packages.map((item) => ({
      id: item.id,
      label: item.label,
      months: item.months,
      discountPercent: item.discountPercent,
      freeMonths: item.freeMonths,
      isActive: item.isActive
    }));
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat pricing subscription");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function saveData() {
  if (form.baseMonthlyPrice <= 0) {
    toast.warning("Base monthly price harus lebih besar dari 0");
    return;
  }

  if (form.packages.some((item) => !item.id.trim() || !item.label.trim() || item.months <= 0)) {
    toast.warning("ID, label, dan durasi paket wajib valid");
    return;
  }

  saving.value = true;
  try {
    await updateSubscriptionPricingSettings({
      baseMonthlyPrice: Number(form.baseMonthlyPrice),
      promoNote: form.promoNote.trim(),
      packages: form.packages.map((item) => ({
        id: item.id.trim(),
        label: item.label.trim(),
        months: Number(item.months),
        discountPercent: Number(item.discountPercent),
        freeMonths: Number(item.freeMonths),
        isActive: Boolean(item.isActive)
      }))
    });

    toast.success("Pricing subscription berhasil disimpan");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menyimpan pricing subscription");
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader
      title="Pricing Subscription"
      subtitle="Kelola harga dasar, diskon paket, dan bonus free month untuk subscription tenant."
    />

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Base Monthly Price</label>
        <input
          v-model.number="form.baseMonthlyPrice"
          type="number"
          min="1"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Promo Note</label>
        <input v-model="form.promoNote" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
    </div>

    <div class="mt-4 rounded-xl border border-slate-200 p-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-900">Daftar Paket</h3>
        <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs" @click="addPackage">Tambah Paket</button>
      </div>

      <div v-if="loading" class="mt-3 text-sm text-slate-500">Memuat data...</div>

      <div v-else class="mt-3 space-y-3">
        <div v-for="item in form.packages" :key="item.id" class="rounded-lg border border-slate-200 p-3">
          <div class="grid gap-3 md:grid-cols-3">
            <div>
              <label class="text-xs font-medium uppercase tracking-wide text-slate-500">ID</label>
              <input v-model="item.id" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
              <input v-model="item.label" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Durasi (bulan)</label>
              <input v-model.number="item.months" type="number" min="1" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Diskon (%)</label>
              <input
                v-model.number="item.discountPercent"
                type="number"
                min="0"
                max="100"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Free Month</label>
              <input v-model.number="item.freeMonths" type="number" min="0" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div class="flex items-end justify-between gap-3">
              <label class="inline-flex items-center gap-2 text-sm text-slate-700">
                <input v-model="item.isActive" type="checkbox" />
                Active
              </label>
              <button class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700" @click="removePackage(item.id)">
                Hapus
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex justify-end">
      <LoadingButton
        :loading="saving"
        loading-text="Menyimpan..."
        class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        @click="saveData"
      >
        Simpan Pricing
      </LoadingButton>
    </div>
  </section>
</template>
