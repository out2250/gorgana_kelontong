<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageFilterBar from "@/components/PageFilterBar.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { createUser, getStores, getUsers, updateUserEmployment, type StoreDto, type UserDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/services/toast";
import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const users = ref<UserDto[]>([]);
const stores = ref<StoreDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const toast = useToast();
const search = ref("");
const page = ref(1);
const searchDebounceTimer = ref<number | null>(null);
const suppressFilterWatcher = ref(false);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const updatingUserId = ref("");
const roleFilter = ref<"" | "owner" | "manager" | "cashier">("");
const conditionFilter = ref<"" | "on_duty" | "on_leave" | "sick" | "on_penalty">("");
const attendanceFilter = ref<"" | "present" | "absent" | "late" | "off">("");
const storeFilter = ref("");
const storeLovOpen = ref(false);
const storeSearch = ref("");
const employmentDrafts = reactive<
  Record<
    string,
    {
      isActive: boolean;
      conditionStatus: "on_duty" | "on_leave" | "sick" | "on_penalty";
      attendanceStatus: "present" | "absent" | "late" | "off";
      scheduleLabel: string;
      scheduleStartTime: string;
      scheduleEndTime: string;
    }
  >
>({});

const form = reactive({
  username: "",
  fullName: "",
  email: "",
  password: "",
  phoneNumber: "",
  jobResponsibility: "",
  conditionStatus: "on_duty" as "on_duty" | "on_leave" | "sick" | "on_penalty",
  attendanceStatus: "off" as "present" | "absent" | "late" | "off",
  scheduleLabel: "",
  scheduleStartTime: "",
  scheduleEndTime: "",
  role: "cashier" as "owner" | "manager" | "cashier",
  storeId: ""
});
const auth = useAuthStore();

const filteredStores = ref<StoreDto[]>([]);

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const [usersData, storesData] = await Promise.all([
      getUsers({
        page: page.value,
        pageSize: 10,
        search: search.value || undefined,
        storeId: auth.user?.isSuperAdmin ? (storeFilter.value || undefined) : undefined,
        role: roleFilter.value || undefined,
        conditionStatus: conditionFilter.value || undefined,
        attendanceStatus: attendanceFilter.value || undefined
      }),
      getStores({ page: 1, pageSize: 100 })
    ]);
    users.value = usersData.items;
    pagination.value = usersData.pagination;
    stores.value = storesData.items;
    filteredStores.value = storesData.items;

    usersData.items.forEach((user) => {
      employmentDrafts[user.id] = {
        isActive: user.isActive,
        conditionStatus: user.conditionStatus ?? "on_duty",
        attendanceStatus: user.attendanceStatus ?? "off",
        scheduleLabel: user.scheduleLabel ?? "",
        scheduleStartTime: user.scheduleStartTime ?? "",
        scheduleEndTime: user.scheduleEndTime ?? ""
      };
    });

    Object.keys(employmentDrafts).forEach((id) => {
      if (!usersData.items.some((user) => user.id === id)) {
        delete employmentDrafts[id];
      }
    });

    if (!form.storeId && storesData.items.length > 0) {
      form.storeId = storesData.items[0].id;
    }
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat user");
  } finally {
    loading.value = false;
  }
}

function openStoreLov() {
  storeSearch.value = "";
  filteredStores.value = stores.value;
  storeLovOpen.value = true;
}

function closeStoreLov() {
  storeLovOpen.value = false;
}

function selectStoreFilter(storeId: string) {
  storeFilter.value = storeId;
  closeStoreLov();
}

function clearStoreFilter() {
  storeFilter.value = "";
  closeStoreLov();
}

watch(storeSearch, (keyword) => {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    filteredStores.value = stores.value;
    return;
  }

  filteredStores.value = stores.value.filter((store) => {
    const name = store.name.toLowerCase();
    const address = (store.address || "").toLowerCase();
    return name.includes(normalized) || address.includes(normalized);
  });
});

const selectedStoreLabel = ref("Semua store");

watch([storeFilter, stores], () => {
  if (!storeFilter.value) {
    selectedStoreLabel.value = "Semua store";
    return;
  }

  const target = stores.value.find((item) => item.id === storeFilter.value);
  selectedStoreLabel.value = target?.name || "Semua store";
}, { immediate: true });

async function submitCreateUser() {
  if (!form.storeId) {
    toast.warning("Store belum tersedia. Coba pilih filter store dulu.");
    return;
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(form.username) || form.username.length < 3) {
    toast.warning("Username minimal 3 karakter dan hanya boleh huruf/angka/._-");
    return;
  }

  if (form.password.length < 10) {
    toast.warning("Password user minimal 10 karakter");
    return;
  }

  if ((form.jobResponsibility || "").trim().length < 2) {
    toast.warning("Job Responsibility minimal 2 karakter");
    return;
  }

  submitting.value = true;
  try {
    await createUser({
      username: form.username,
      fullName: form.fullName,
      email: form.email,
      password: form.password,
      role: form.role,
      phoneNumber: form.phoneNumber || undefined,
      jobResponsibility: form.jobResponsibility,
      conditionStatus: form.conditionStatus,
      attendanceStatus: form.attendanceStatus,
      scheduleLabel: form.scheduleLabel || undefined,
      scheduleStartTime: form.scheduleStartTime || undefined,
      scheduleEndTime: form.scheduleEndTime || undefined,
      storeIds: [form.storeId]
    });

    form.username = "";
    form.fullName = "";
    form.email = "";
    form.password = "";
    form.phoneNumber = "";
    form.jobResponsibility = "";
    form.conditionStatus = "on_duty";
    form.attendanceStatus = "off";
    form.scheduleLabel = "";
    form.scheduleStartTime = "";
    form.scheduleEndTime = "";
    form.role = "cashier";
    toast.success("User berhasil ditambahkan");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menambah user");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadData();
});

function resetFilters() {
  suppressFilterWatcher.value = true;

  search.value = "";
  roleFilter.value = "";
  conditionFilter.value = "";
  attendanceFilter.value = "";
  if (auth.user?.isSuperAdmin) {
    storeFilter.value = "";
  }

  page.value = 1;

  if (searchDebounceTimer.value) {
    window.clearTimeout(searchDebounceTimer.value);
  }

  suppressFilterWatcher.value = false;
  void loadData();
}

watch(storeFilter, () => {
  if (suppressFilterWatcher.value) {
    return;
  }

  if (!auth.user?.isSuperAdmin) {
    return;
  }

  if (storeFilter.value) {
    form.storeId = storeFilter.value;
  } else if (stores.value.length > 0) {
    form.storeId = stores.value[0].id;
  }

  page.value = 1;
  void loadData();
});

watch([roleFilter, conditionFilter, attendanceFilter], () => {
  if (suppressFilterWatcher.value) {
    return;
  }

  page.value = 1;
  void loadData();
});

watch(search, () => {
  if (suppressFilterWatcher.value) {
    return;
  }

  page.value = 1;

  if (searchDebounceTimer.value) {
    window.clearTimeout(searchDebounceTimer.value);
  }

  searchDebounceTimer.value = window.setTimeout(() => {
    void loadData();
  }, 350);
});

onBeforeUnmount(() => {
  if (searchDebounceTimer.value) {
    window.clearTimeout(searchDebounceTimer.value);
  }
});

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadData();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadData();
  }
}

async function saveEmployment(userId: string) {
  const draft = employmentDrafts[userId];
  if (!draft) {
    return;
  }

  updatingUserId.value = userId;
  try {
    await updateUserEmployment(userId, {
      isActive: draft.isActive,
      conditionStatus: draft.conditionStatus,
      attendanceStatus: draft.attendanceStatus,
      scheduleLabel: draft.scheduleLabel,
      scheduleStartTime: draft.scheduleStartTime,
      scheduleEndTime: draft.scheduleEndTime
    });
    toast.success("Status karyawan diperbarui");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal update status karyawan");
    toast.error(error.value);
  } finally {
    updatingUserId.value = "";
  }
}
</script>

<template>
  <section>
    <PageHeader title="User Management">
      <template #right>
        <span class="text-xs text-slate-500">{{ loading ? "Loading..." : `${pagination.total} user` }}</span>
      </template>
    </PageHeader>
    <UserManagementSubmenu />

    <PageFilterBar>
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari nama/email" />
      <button
        v-if="auth.user?.isSuperAdmin"
        type="button"
        class="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm"
        @click="openStoreLov"
      >
        {{ selectedStoreLabel }}
      </button>
      <select v-model="roleFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">semua role</option>
        <option value="owner">owner</option>
        <option value="manager">manager</option>
        <option value="cashier">cashier</option>
      </select>
      <select v-model="conditionFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">semua kondisi</option>
        <option value="on_duty">on_duty</option>
        <option value="on_leave">on_leave</option>
        <option value="sick">sick</option>
        <option value="on_penalty">on_penalty</option>
      </select>
      <select v-model="attendanceFilter" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">semua absensi</option>
        <option value="present">present</option>
        <option value="absent">absent</option>
        <option value="late">late</option>
        <option value="off">off</option>
      </select>
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadData">Filter</button>
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="resetFilters">Reset</button>
    </PageFilterBar>

    <form class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-6" @submit.prevent="submitCreateUser">
      <input
        v-model="form.username"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Username"
        pattern="[a-zA-Z0-9._-]+"
        minlength="3"
        required
      />
      <input v-model="form.fullName" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama" required />
      <input v-model="form.email" type="email" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Email" required />
      <input
        v-model="form.password"
        type="password"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Password (min 10)"
        minlength="10"
        required
      />
      <input v-model="form.phoneNumber" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="No HP" />
      <input v-model="form.jobResponsibility" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Job Responsibility" required />
      <select v-model="form.role" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="owner">owner</option>
        <option value="manager">manager</option>
        <option value="cashier">cashier</option>
      </select>
      <select v-model="form.conditionStatus" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="on_duty">on_duty</option>
        <option value="on_leave">on_leave</option>
        <option value="sick">sick</option>
        <option value="on_penalty">on_penalty</option>
      </select>
      <select v-model="form.attendanceStatus" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="present">present</option>
        <option value="absent">absent</option>
        <option value="late">late</option>
        <option value="off">off</option>
      </select>
      <input v-model="form.scheduleLabel" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Label jadwal (opsional)" />
      <input v-model="form.scheduleStartTime" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input v-model="form.scheduleEndTime" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Tambah User
      </LoadingButton>
    </form>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Nama</th>
            <th class="px-4 py-3">Email</th>
            <th class="px-4 py-3">Role</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Kondisi</th>
            <th class="px-4 py-3">Absensi</th>
            <th class="px-4 py-3">Jadwal</th>
            <th class="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="user in users" :key="user.id">
            <td class="px-4 py-3 text-slate-900">{{ user.fullName }}</td>
            <td class="px-4 py-3 text-slate-600">{{ user.email }}</td>
            <td class="px-4 py-3 uppercase text-slate-600">{{ user.role }}</td>
            <td class="px-4 py-3">
              <select v-model="employmentDrafts[user.id].isActive" class="rounded border border-slate-300 px-2 py-1 text-xs">
                <option :value="true">active</option>
                <option :value="false">inactive</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <select v-model="employmentDrafts[user.id].conditionStatus" class="rounded border border-slate-300 px-2 py-1 text-xs">
                <option value="on_duty">on_duty</option>
                <option value="on_leave">on_leave</option>
                <option value="sick">sick</option>
                <option value="on_penalty">on_penalty</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <select v-model="employmentDrafts[user.id].attendanceStatus" class="rounded border border-slate-300 px-2 py-1 text-xs">
                <option value="present">present</option>
                <option value="absent">absent</option>
                <option value="late">late</option>
                <option value="off">off</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-col gap-1">
                <input
                  v-model="employmentDrafts[user.id].scheduleLabel"
                  class="rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="label"
                />
                <div class="flex gap-1">
                  <input v-model="employmentDrafts[user.id].scheduleStartTime" type="time" class="rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input v-model="employmentDrafts[user.id].scheduleEndTime" type="time" class="rounded border border-slate-300 px-2 py-1 text-xs" />
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <button
                :disabled="updatingUserId === user.id"
                class="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                @click="saveEmployment(user.id)"
              >
                {{ updatingUserId === user.id ? "Saving..." : "Simpan" }}
              </button>
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
      v-if="storeLovOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="closeStoreLov"
    >
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Store</h3>
          <button type="button" class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeStoreLov">Tutup</button>
        </div>

        <input
          v-model="storeSearch"
          class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Cari nama/alamat store"
        />

        <div class="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-3 py-2">Nama Store</th>
                <th class="px-3 py-2">Alamat</th>
                <th class="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="store in filteredStores" :key="store.id">
                <td class="px-3 py-2 font-medium text-slate-900">{{ store.name }}</td>
                <td class="px-3 py-2 text-slate-600">{{ store.address || '-' }}</td>
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700"
                    @click="selectStoreFilter(store.id)"
                  >
                    Pilih
                  </button>
                </td>
              </tr>
              <tr v-if="filteredStores.length === 0">
                <td colspan="3" class="px-3 py-4 text-center text-slate-500">Store tidak ditemukan</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="rounded border border-slate-300 px-3 py-2 text-sm" @click="clearStoreFilter">Semua store</button>
          <button type="button" class="rounded border border-slate-300 px-3 py-2 text-sm" @click="closeStoreLov">Selesai</button>
        </div>
      </div>
    </div>
  </section>
</template>
