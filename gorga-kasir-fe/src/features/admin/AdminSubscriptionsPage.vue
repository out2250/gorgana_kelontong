<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { ROUTE_PATHS } from "@/constants/routes";
import {
  approveTenantSubscription,
  forceInactiveTenantSubscription,
  getAdminSubscriptions,
  rejectTenantSubscription,
  refundTenantSubscription,
  setTenantTrialAccess,
  updateAdminTenantSubscription,
  type SubscriptionAdminItem
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const loading = ref(false);
const error = ref("");
const updatingTenantId = ref("");
const tenants = ref<SubscriptionAdminItem[]>([]);
const toast = useToast();
const selectedTenant = ref<SubscriptionAdminItem | null>(null);

const filters = reactive({
  page: 1,
  pageSize: 10,
  search: "",
  status: "" as "" | "trial" | "active" | "past_due" | "inactive",
  paymentStatus: "" as "" | "paid" | "unpaid",
  tenantStatus: "" as "" | "pending_approval" | "active" | "rejected" | "inactive"
});

const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

async function loadData() {
  loading.value = true;
  error.value = "";

  try {
    const result = await getAdminSubscriptions({
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search || undefined,
      status: filters.status || undefined,
      paymentStatus: filters.paymentStatus || undefined,
      tenantStatus: filters.tenantStatus || undefined
    });

    tenants.value = result.items;
    pagination.value = result.pagination;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data subscription");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function updatePaymentStatus(tenantId: string, paymentStatus: "paid" | "unpaid") {
  updatingTenantId.value = tenantId;
  try {
    const tenant = tenants.value.find((item) => item.id === tenantId);
    await updateAdminTenantSubscription(tenantId, {
      plan: tenant?.subscription?.plan || "starter",
      status: tenant?.subscription?.status || "trial",
      paymentStatus,
      trialEnabled: tenant?.subscription?.trialEnabled ?? true
    });
    toast.success("Payment status diperbarui");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal update payment status");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function approveTenant(tenantId: string) {
  updatingTenantId.value = tenantId;
  try {
    await approveTenantSubscription(tenantId);
    toast.success("Tenant berhasil di-approve");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal approve tenant (pastikan subscription sudah paid)");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function rejectTenant(tenantId: string) {
  const reason = window.prompt("Alasan reject tenant:", "Pembayaran belum valid");
  if (!reason) {
    return;
  }

  updatingTenantId.value = tenantId;
  try {
    await rejectTenantSubscription(tenantId, reason);
    toast.success("Tenant berhasil di-reject");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal reject tenant");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function refundTenant(tenantId: string) {
  const reason = window.prompt("Alasan refund (opsional):", "Refund processed by super admin") || undefined;

  updatingTenantId.value = tenantId;
  try {
    await refundTenantSubscription(tenantId, reason);
    toast.success("Subscription tenant di-refund");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal refund subscription");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function forceInactiveTenant(tenantId: string) {
  const reason = window.prompt("Alasan force inactive (opsional):", "Force inactive by super admin") || undefined;

  updatingTenantId.value = tenantId;
  try {
    await forceInactiveTenantSubscription(tenantId, reason);
    toast.success("Tenant berhasil di-force inactive");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal force inactive tenant");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function toggleTrial(tenantId: string, enabled: boolean) {
  updatingTenantId.value = tenantId;
  try {
    await setTenantTrialAccess(tenantId, enabled);
    toast.success(`Trial access ${enabled ? "aktif" : "nonaktif"}`);
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal ubah trial access");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

async function updateSubscription(tenantId: string, status: "trial" | "active" | "past_due" | "inactive") {
  updatingTenantId.value = tenantId;
  try {
    const tenant = tenants.value.find((item) => item.id === tenantId);
    await updateAdminTenantSubscription(tenantId, {
      plan: tenant?.subscription?.plan || "1_month",
      status
    });
    toast.success("Subscription tenant diperbarui");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal update subscription tenant");
    toast.error(error.value);
  } finally {
    updatingTenantId.value = "";
  }
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    filters.page += 1;
    void loadData();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    filters.page -= 1;
    void loadData();
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Admin Subscription" subtitle="Aktif/nonaktif subscription tenant (platform-level)." />

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-5">
      <input v-model="filters.search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari tenant" />
      <select v-model="filters.status" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">all status</option>
        <option value="trial">trial</option>
        <option value="active">active</option>
        <option value="past_due">past_due</option>
        <option value="inactive">inactive</option>
      </select>
      <select v-model="filters.paymentStatus" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">all payment</option>
        <option value="paid">paid</option>
        <option value="unpaid">unpaid</option>
      </select>
      <select v-model="filters.tenantStatus" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">all tenant status</option>
        <option value="pending_approval">pending_approval</option>
        <option value="active">active</option>
        <option value="rejected">rejected</option>
        <option value="inactive">inactive</option>
      </select>
      <LoadingButton
        :loading="loading"
        loading-text="Loading..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        @click="loadData"
      >
        Load
      </LoadingButton>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Tenant</th>
            <th class="px-4 py-3">Users</th>
            <th class="px-4 py-3">Stores</th>
            <th class="px-4 py-3">Plan</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Payment</th>
            <th class="px-4 py-3">Tenant Status</th>
            <th class="px-4 py-3">Request Status</th>
            <th class="px-4 py-3">Trial Access</th>
            <th class="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="tenant in tenants" :key="tenant.id">
            <td class="px-4 py-3 font-medium text-slate-900">{{ tenant.name }}</td>
            <td class="px-4 py-3 text-slate-600">{{ tenant.usersCount }}</td>
            <td class="px-4 py-3 text-slate-600">{{ tenant.storesCount }}</td>
            <td class="px-4 py-3 text-slate-600">{{ tenant.subscription?.plan || "-" }}</td>
            <td class="px-4 py-3">
              <span class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{{ tenant.subscription?.status || "none" }}</span>
            </td>
            <td class="px-4 py-3">
              <select
                :disabled="updatingTenantId === tenant.id || !tenant.subscription"
                class="rounded border border-slate-300 px-2 py-1 text-xs"
                :value="tenant.subscription?.paymentStatus || 'unpaid'"
                @change="updatePaymentStatus(tenant.id, ($event.target as HTMLSelectElement).value as 'paid' | 'unpaid')"
              >
                <option value="paid">paid</option>
                <option value="unpaid">unpaid</option>
              </select>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ tenant.status || "pending_approval" }}</td>
            <td class="px-4 py-3 text-slate-600">{{ tenant.subscription?.requestStatus || '-' }}</td>
            <td class="px-4 py-3">
              <label class="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  :disabled="updatingTenantId === tenant.id || !tenant.subscription"
                  type="checkbox"
                  :checked="tenant.subscription?.trialEnabled ?? false"
                  @change="toggleTrial(tenant.id, ($event.target as HTMLInputElement).checked)"
                />
                enabled
              </label>
            </td>
            <td class="px-4 py-3 align-top">
              <div class="flex min-w-[460px] flex-wrap items-center gap-2">
                <button
                  class="rounded border border-slate-300 px-2 py-1 text-xs"
                  @click="selectedTenant = tenant"
                >
                  Detail
                </button>
                <RouterLink
                  class="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                  :to="`${ROUTE_PATHS.tenantStoreDetail}?tenantId=${tenant.id}`"
                >
                  Tenant Detail
                </RouterLink>
                <select
                  :disabled="updatingTenantId === tenant.id"
                  class="rounded border border-slate-300 px-2 py-1 text-xs"
                  :value="tenant.subscription?.status || 'inactive'"
                  @change="updateSubscription(tenant.id, ($event.target as HTMLSelectElement).value as 'trial' | 'active' | 'past_due' | 'inactive')"
                >
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="past_due">past_due</option>
                  <option value="inactive">inactive</option>
                </select>
                <button
                  :disabled="updatingTenantId === tenant.id || tenant.status === 'active'"
                  class="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 disabled:opacity-50"
                  @click="approveTenant(tenant.id)"
                >
                  Approve
                </button>
                <button
                  v-if="tenant.status !== 'active'"
                  :disabled="updatingTenantId === tenant.id || tenant.status === 'rejected'"
                  class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                  @click="rejectTenant(tenant.id)"
                >
                  Reject
                </button>
                <button
                  v-else
                  :disabled="updatingTenantId === tenant.id"
                  class="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 disabled:opacity-50"
                  @click="refundTenant(tenant.id)"
                >
                  Refund
                </button>
                <button
                  v-if="tenant.status === 'active'"
                  :disabled="updatingTenantId === tenant.id"
                  class="rounded border border-slate-400 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                  @click="forceInactiveTenant(tenant.id)"
                >
                  Force Inactive
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>

    <div
      v-if="selectedTenant"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="selectedTenant = null"
    >
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Detail Subscription Tenant</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectedTenant = null">Tutup</button>
        </div>

        <div class="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <p><span class="font-medium">Tenant:</span> {{ selectedTenant.name }}</p>
          <p><span class="font-medium">Status Tenant:</span> {{ selectedTenant.status || '-' }}</p>
          <p><span class="font-medium">PIC:</span> {{ selectedTenant.fullName || '-' }}</p>
          <p><span class="font-medium">No HP:</span> {{ selectedTenant.contactPhone || '-' }}</p>
          <p><span class="font-medium">Alamat:</span> {{ selectedTenant.address || '-' }}</p>
          <p><span class="font-medium">Approved At:</span> {{ selectedTenant.approvedAt || '-' }}</p>
          <p><span class="font-medium">Users:</span> {{ selectedTenant.usersCount }}</p>
          <p><span class="font-medium">Stores:</span> {{ selectedTenant.storesCount }}</p>
          <p><span class="font-medium">Plan:</span> {{ selectedTenant.subscription?.plan || '-' }}</p>
          <p><span class="font-medium">Status Sub:</span> {{ selectedTenant.subscription?.status || '-' }}</p>
          <p><span class="font-medium">Payment:</span> {{ selectedTenant.subscription?.paymentStatus || '-' }}</p>
          <p><span class="font-medium">Request Status:</span> {{ selectedTenant.subscription?.requestStatus || '-' }}</p>
          <p><span class="font-medium">Starts:</span> {{ selectedTenant.subscription?.startsAt || '-' }}</p>
          <p><span class="font-medium">Ends:</span> {{ selectedTenant.subscription?.endsAt || '-' }}</p>
          <p class="md:col-span-2"><span class="font-medium">Rejection Reason:</span> {{ selectedTenant.rejectionReason || '-' }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
