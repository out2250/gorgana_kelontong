<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { ROUTE_PATHS } from "@/constants/routes";
import { getPublicSubscriptionPlans, signupOwner, type SubscriptionPricingPackage } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const router = useRouter();
const toast = useToast();

const loading = ref(false);
const loadingPlans = ref(false);
const errorMessage = ref("");
const promoNote = ref("");
const planOptions = ref<SubscriptionPricingPackage[]>([]);
const detailPlanId = ref("");

const form = reactive({
  username: "",
  fullName: "",
  tenantName: "",
  email: "",
  password: "",
  confirmPassword: "",
  address: "",
  contactPhone: "",
  plan: "1_month"
});

const selectedPlan = computed(() => planOptions.value.find((item) => item.id === form.plan) ?? null);
const detailPlan = computed(() => planOptions.value.find((item) => item.id === detailPlanId.value) ?? null);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatBenefit(plan: SubscriptionPricingPackage) {
  const base = `${plan.months} bulan`;
  if (plan.freeMonths > 0) {
    return `${base} + bonus ${plan.freeMonths} bulan`;
  }
  return base;
}

function setSelectedPlan(planId: string) {
  form.plan = planId;
}

function openPlanDetail(planId: string) {
  detailPlanId.value = planId;
}

function closePlanDetail() {
  detailPlanId.value = "";
}

async function loadPlans() {
  loadingPlans.value = true;
  try {
    const result = await getPublicSubscriptionPlans();
    promoNote.value = result.promoNote ?? "";
    planOptions.value = result.packages
      .filter((item) => item.isActive)
      .sort((left, right) => left.months - right.months);

    if (!planOptions.value.some((item) => item.id === form.plan) && planOptions.value.length > 0) {
      form.plan = planOptions.value[0].id;
    }

  } catch (error) {
    errorMessage.value = getErrorMessage(error, "Gagal memuat paket subscription");
    toast.error(errorMessage.value);
  } finally {
    loadingPlans.value = false;
  }
}

async function handleSubmit() {
  if (form.password !== form.confirmPassword) {
    errorMessage.value = "Konfirmasi password tidak sama";
    toast.error(errorMessage.value);
    return;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(form.username) || form.username.length < 3) {
    errorMessage.value = "Username minimal 3 karakter dan hanya boleh huruf/angka/._-";
    toast.error(errorMessage.value);
    return;
  }

  if ((form.contactPhone || "").trim().length < 8) {
    errorMessage.value = "Nomor HP minimal 8 digit";
    toast.error(errorMessage.value);
    return;
  }

  if (!selectedPlan.value) {
    errorMessage.value = "Pilih paket subscription terlebih dahulu";
    toast.error(errorMessage.value);
    return;
  }

  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await signupOwner({
      username: form.username,
      fullName: form.fullName,
      tenantName: form.tenantName,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
      address: form.address,
      contactPhone: form.contactPhone,
      plan: form.plan
    });

    toast.success(result.message || "Pendaftaran owner berhasil, menunggu approval");
    await router.push({
      path: ROUTE_PATHS.accessPending,
      query: {
        tenant: form.tenantName,
        reason: "Akun owner sudah terdaftar dan menunggu approval super admin"
      }
    });
  } catch (error) {
    errorMessage.value = getErrorMessage(error, "Pendaftaran owner gagal");
    toast.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadPlans();
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <div class="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 class="text-xl font-bold text-slate-900">Daftar Owner</h1>
      <p class="mt-1 text-sm text-slate-500">Akun akan berstatus pending sampai disetujui super admin dan subscription paid.</p>

      <form class="mt-5 grid gap-3 md:grid-cols-2" @submit.prevent="handleSubmit">
        <div>
          <label class="mb-1 block text-sm text-slate-700">Username</label>
          <input v-model="form.username" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-700">Nama Lengkap</label>
          <input v-model="form.fullName" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-700">Nama Tenant</label>
          <input v-model="form.tenantName" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-700">Nomor HP</label>
          <input v-model="form.contactPhone" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div class="md:col-span-2">
          <label class="mb-2 block text-sm text-slate-700">Paket Subscription</label>
          <div v-if="loadingPlans" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Memuat paket subscription...
          </div>
          <div v-else class="overflow-hidden rounded-lg border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th class="px-3 py-2">Paket</th>
                  <th class="px-3 py-2">Harga</th>
                  <th class="px-3 py-2">Benefit</th>
                  <th class="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 bg-white">
                <tr
                  v-for="option in planOptions"
                  :key="option.id"
                  :class="form.plan === option.id ? 'bg-blue-50' : ''"
                >
                  <td class="px-3 py-2 font-medium text-slate-900">{{ option.label }}</td>
                  <td class="px-3 py-2 text-slate-700">{{ formatCurrency(option.finalPrice ?? option.grossPrice ?? 0) }}</td>
                  <td class="px-3 py-2 text-slate-700">{{ formatBenefit(option) }}</td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                        @click="setSelectedPlan(option.id)"
                      >
                        {{ form.plan === option.id ? "Terpilih" : "Pilih" }}
                      </button>
                      <button
                        type="button"
                        class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                        @click="openPlanDetail(option.id)"
                      >
                        Detail
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="promoNote" class="mt-2 text-xs text-blue-700">Promo: {{ promoNote }}</p>
        </div>

        <div class="md:col-span-2">
          <label class="mb-1 block text-sm text-slate-700">Email</label>
          <input v-model="form.email" type="email" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-sm text-slate-700">Alamat</label>
          <textarea v-model="form.address" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-700">Password</label>
          <input v-model="form.password" type="password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm text-slate-700">Konfirmasi Password</label>
          <input v-model="form.confirmPassword" type="password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>

        <div class="md:col-span-2">
          <PageErrorAlert :message="errorMessage" />
        </div>

        <div class="md:col-span-2 grid gap-2 md:grid-cols-2">
          <LoadingButton
            :loading="loading"
            loading-text="Memproses..."
            class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Daftar Owner
          </LoadingButton>
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            @click="router.push(ROUTE_PATHS.login)"
          >
            Kembali ke Login
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="detailPlan"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      @click.self="closePlanDetail"
    >
      <div class="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 class="text-sm font-semibold text-slate-900">Detail Paket Subscription</h3>
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
            @click="closePlanDetail"
          >
            Tutup
          </button>
        </div>

        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Paket</td>
              <td class="px-3 py-2 text-slate-900">{{ detailPlan.label }}</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Durasi Bayar</td>
              <td class="px-3 py-2 text-slate-900">{{ detailPlan.months }} bulan</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Diskon</td>
              <td class="px-3 py-2 text-slate-900">{{ detailPlan.discountPercent }}%</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Bonus</td>
              <td class="px-3 py-2 text-slate-900">{{ detailPlan.freeMonths }} bulan</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Masa Aktif Efektif</td>
              <td class="px-3 py-2 text-slate-900">{{ detailPlan.effectiveMonths ?? detailPlan.months }} bulan</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Harga Normal</td>
              <td class="px-3 py-2 text-slate-900">{{ formatCurrency(detailPlan.grossPrice ?? 0) }}</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Hemat</td>
              <td class="px-3 py-2 text-slate-900">{{ formatCurrency(detailPlan.discountAmount ?? 0) }}</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Total Bayar</td>
              <td class="px-3 py-2 font-semibold text-slate-900">{{ formatCurrency(detailPlan.finalPrice ?? 0) }}</td>
            </tr>
            <tr>
              <td class="px-3 py-2 font-medium text-slate-700">Efektif / Bulan</td>
              <td class="px-3 py-2 text-slate-900">{{ formatCurrency(detailPlan.effectiveMonthlyPrice ?? 0) }}</td>
            </tr>
            <tr v-if="promoNote">
              <td class="px-3 py-2 font-medium text-slate-700">Promo & Benefit</td>
              <td class="px-3 py-2 text-slate-900">{{ promoNote }} • {{ formatBenefit(detailPlan) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
