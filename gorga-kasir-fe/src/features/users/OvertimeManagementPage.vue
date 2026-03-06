<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  assignOvertime,
  getOvertimeAssignments,
  getUsers,
  updateOvertimeStatus,
  type OvertimeAssignmentDto,
  type UserDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const auth = useAuthStore();
const toast = useToast();

const loading = ref(false);
const submitting = ref(false);
const processingId = ref("");
const error = ref("");
const items = ref<OvertimeAssignmentDto[]>([]);
const users = ref<UserDto[]>([]);

const canManage = computed(() => Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner" || auth.user?.role === "manager"));

const form = reactive({
  userId: "",
  date: "",
  startTime: "18:00",
  endTime: "20:00",
  note: ""
});

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const [overtimeData, usersData] = await Promise.all([
      getOvertimeAssignments(),
      getUsers({ page: 1, pageSize: 100 })
    ]);

    items.value = overtimeData.items;
    users.value = usersData.items;

    if (!form.userId && users.value.length > 0) {
      form.userId = users.value[0].id;
    }
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat overtime data");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function submitOvertime() {
  if (!canManage.value) {
    toast.warning("Anda tidak punya akses assign overtime");
    return;
  }

  if (!form.userId || !form.date || !form.startTime || !form.endTime) {
    toast.warning("Lengkapi user, tanggal, jam mulai, jam selesai");
    return;
  }

  submitting.value = true;
  try {
    await assignOvertime({
      userId: form.userId,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      note: form.note.trim() || undefined
    });
    toast.success("Lembur berhasil di-assign");
    form.note = "";
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal assign overtime");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

async function changeStatus(id: string, status: "assigned" | "completed" | "cancelled") {
  processingId.value = id;
  try {
    await updateOvertimeStatus(id, { status });
    toast.success("Status overtime diperbarui");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal update overtime");
    toast.error(error.value);
  } finally {
    processingId.value = "";
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Overtime Management" subtitle="Assign lembur dan monitor status overtime." />
    <UserManagementSubmenu />

    <form class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-5" @submit.prevent="submitOvertime">
      <select v-model="form.userId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="user in users" :key="user.id" :value="user.id">{{ user.fullName }}</option>
      </select>
      <input v-model="form.date" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <input v-model="form.startTime" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <input v-model="form.endTime" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <LoadingButton
        :loading="submitting"
        loading-text="Menyimpan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Assign Lembur
      </LoadingButton>
      <input
        v-model="form.note"
        class="md:col-span-5 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Catatan (opsional)"
      />
    </form>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Tanggal</th>
            <th class="px-4 py-3">Jam</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Catatan</th>
            <th class="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3">{{ item.userName }}</td>
            <td class="px-4 py-3">{{ item.date }}</td>
            <td class="px-4 py-3">{{ item.startTime }} - {{ item.endTime }}</td>
            <td class="px-4 py-3">{{ item.status }}</td>
            <td class="px-4 py-3">{{ item.note || '-' }}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button
                  :disabled="processingId === item.id"
                  class="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 disabled:opacity-50"
                  @click="changeStatus(item.id, 'completed')"
                >
                  Complete
                </button>
                <button
                  :disabled="processingId === item.id"
                  class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                  @click="changeStatus(item.id, 'cancelled')"
                >
                  Cancel
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">Belum ada data overtime</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
