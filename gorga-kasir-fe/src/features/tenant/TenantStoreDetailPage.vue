<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  getAdminSubscriptions,
  getAdminTenantStoreDetail,
  getTenantStoreDetail,
  updateTenantStoreDetail,
  type SubscriptionAdminItem
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

const auth = useAuthStore();
const route = useRoute();
const toast = useToast();

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const tenantList = ref<SubscriptionAdminItem[]>([]);
const selectedTenantId = ref("");

const isSuperAdmin = computed(() => Boolean(auth.user?.isSuperAdmin));
const isOwner = computed(() => auth.user?.role === "owner" && !isSuperAdmin.value);

const form = reactive({
  tenantId: "",
  tenantName: "",
  ownerName: "",
  tenantAddress: "",
  contactPhone: "",
  npwp: "",
  importantInfo: "",
  stores: [] as Array<{ id: string; name: string; address: string }>
});

async function loadTenantList() {
  if (!isSuperAdmin.value) {
    return;
  }

  const list = await getAdminSubscriptions({ page: 1, pageSize: 100 });
  tenantList.value = list.items;

  const queryTenantId = typeof route.query.tenantId === "string" ? route.query.tenantId : "";
  if (queryTenantId && tenantList.value.some((item) => item.id === queryTenantId)) {
    selectedTenantId.value = queryTenantId;
    return;
  }

  if (!selectedTenantId.value && tenantList.value.length > 0) {
    selectedTenantId.value = tenantList.value[0].id;
  }
}

function applyForm(detail: Awaited<ReturnType<typeof getTenantStoreDetail>>) {
  form.tenantId = detail.tenant.id;
  form.tenantName = detail.tenant.name;
  form.ownerName = detail.tenant.ownerName;
  form.tenantAddress = detail.tenant.address;
  form.contactPhone = detail.tenant.contactPhone;
  form.npwp = detail.tenant.npwp;
  form.importantInfo = detail.tenant.importantInfo;
  form.stores = detail.stores.map((store) => ({
    id: store.id,
    name: store.name,
    address: store.address ?? ""
  }));
}

async function loadDetail() {
  loading.value = true;
  error.value = "";

  try {
    if (isSuperAdmin.value) {
      if (!selectedTenantId.value) {
        return;
      }
      const result = await getAdminTenantStoreDetail(selectedTenantId.value);
      applyForm(result);
      return;
    }

    const result = await getTenantStoreDetail();
    applyForm(result);
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat detail tenant/store");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function saveData() {
  if (!isOwner.value) {
    return;
  }

  if (!form.tenantName.trim() || !form.ownerName.trim() || !form.tenantAddress.trim() || !form.contactPhone.trim()) {
    toast.warning("Nama tenant, owner, alamat, dan kontak wajib diisi");
    return;
  }

  if (form.stores.some((store) => !store.name.trim())) {
    toast.warning("Nama store tidak boleh kosong");
    return;
  }

  saving.value = true;
  try {
    await updateTenantStoreDetail({
      tenantName: form.tenantName.trim(),
      ownerName: form.ownerName.trim(),
      tenantAddress: form.tenantAddress.trim(),
      contactPhone: form.contactPhone.trim(),
      npwp: form.npwp.trim(),
      importantInfo: form.importantInfo.trim(),
      stores: form.stores.map((store) => ({
        id: store.id,
        name: store.name.trim(),
        address: store.address.trim()
      }))
    });
    toast.success("Detail tenant/store berhasil diperbarui");
    await loadDetail();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menyimpan detail tenant/store");
    toast.error(error.value);
  } finally {
    saving.value = false;
  }
}

watch(selectedTenantId, () => {
  if (isSuperAdmin.value) {
    void loadDetail();
  }
});

onMounted(async () => {
  try {
    if (isSuperAdmin.value) {
      await loadTenantList();
    }
    await loadDetail();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data awal");
    toast.error(error.value);
  }
});
</script>

<template>
  <section>
    <PageHeader
      title="Tenant / Store Detail"
      :subtitle="isSuperAdmin ? 'Detail tenant untuk monitoring super admin (data sensitif dimasking).' : 'Kelola informasi tenant dan store Anda.'"
    />

    <div v-if="isSuperAdmin" class="mt-4 rounded-xl border border-slate-200 p-3">
      <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Pilih Tenant</label>
      <select v-model="selectedTenantId" class="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="tenant in tenantList" :key="tenant.id" :value="tenant.id">
          {{ tenant.name }}
        </option>
      </select>
    </div>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Nama Tenant</label>
        <input v-model="form.tenantName" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Nama Owner</label>
        <input v-model="form.ownerName" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Alamat Tenant</label>
        <textarea v-model="form.tenantAddress" :disabled="!isOwner" rows="3" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>
      <div>
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Kontak</label>
        <input v-model="form.contactPhone" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
        <label class="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">NPWP</label>
        <input v-model="form.npwp" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>
      <div class="md:col-span-2">
        <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Info Penting</label>
        <textarea v-model="form.importantInfo" :disabled="!isOwner" rows="3" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      </div>
    </div>

    <div class="mt-4 rounded-xl border border-slate-200 p-4">
      <h3 class="text-sm font-semibold text-slate-900">Store Aktif</h3>
      <div v-if="loading" class="mt-3 text-sm text-slate-500">Memuat data...</div>
      <div v-else class="mt-3 space-y-3">
        <div v-for="store in form.stores" :key="store.id" class="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
          <div>
            <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Nama Store</label>
            <input v-model="store.name" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          </div>
          <div>
            <label class="text-xs font-medium uppercase tracking-wide text-slate-500">Alamat Store</label>
            <input v-model="store.address" :disabled="!isOwner" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="isOwner" class="mt-4 flex justify-end">
      <LoadingButton
        :loading="saving"
        loading-text="Menyimpan..."
        class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
        @click="saveData"
      >
        Simpan Perubahan
      </LoadingButton>
    </div>
  </section>
</template>
