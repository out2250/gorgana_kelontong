<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  endDay,
  getAttendanceHistory,
  getAttendanceTodayStatus,
  startDay,
  type AttendanceLogDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const toast = useToast();

const loading = ref(false);
const actionLoading = ref(false);
const error = ref("");
const items = ref<AttendanceLogDto[]>([]);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const todayStatus = ref<Awaited<ReturnType<typeof getAttendanceTodayStatus>> | null>(null);

const canEndDay = computed(() => Boolean(todayStatus.value?.todayLog && !todayStatus.value.todayLog.endAt));

async function loadToday() {
  try {
    todayStatus.value = await getAttendanceTodayStatus();
  } catch {
    todayStatus.value = null;
  }
}

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getAttendanceHistory({
      page: pagination.value.page,
      pageSize: pagination.value.pageSize
    });
    items.value = result.items;
    pagination.value = result.pagination;
    await loadToday();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat history absensi");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function doStartDay() {
  actionLoading.value = true;
  try {
    await startDay();
    toast.success("Start Day berhasil");
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal Start Day");
    toast.error(error.value);
  } finally {
    actionLoading.value = false;
  }
}

async function doEndDay(force = false) {
  actionLoading.value = true;
  try {
    await endDay({ force });
    toast.success("End Day berhasil");
    await loadData();
  } catch (err: any) {
    const forceRequired = Boolean(err?.response?.data?.requireForce);
    if (forceRequired) {
      const proceed = window.confirm(`${err.response?.data?.message || "Lembur belum selesai"}. Tetap End Day?`);
      if (proceed) {
        await doEndDay(true);
      }
      return;
    }

    error.value = getErrorMessage(err, "Gagal End Day");
    toast.error(error.value);
  } finally {
    actionLoading.value = false;
  }
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    pagination.value.page += 1;
    void loadData();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    pagination.value.page -= 1;
    void loadData();
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Absent History" subtitle="Riwayat absensi harian + Start/End Day." />
    <UserManagementSubmenu />

    <div class="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
      <button
        :disabled="actionLoading || !todayStatus?.canStartDay"
        class="rounded border border-blue-300 px-3 py-2 text-xs text-blue-700 disabled:opacity-50"
        @click="doStartDay"
      >
        Start Day
      </button>
      <button
        :disabled="actionLoading || !canEndDay"
        class="rounded border border-slate-400 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
        @click="doEndDay()"
      >
        End Day
      </button>
      <p class="text-xs text-slate-500">
        {{ todayStatus?.blockReason || (canEndDay ? 'Hari ini sudah start, silakan End Day di sini.' : 'Belum ada aktivitas hari ini.') }}
      </p>
    </div>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Tanggal</th>
            <th class="px-4 py-3">Start</th>
            <th class="px-4 py-3">End</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Catatan</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3">{{ item.userName }}</td>
            <td class="px-4 py-3">{{ item.date }}</td>
            <td class="px-4 py-3">{{ item.startAt || '-' }}</td>
            <td class="px-4 py-3">{{ item.endAt || '-' }}</td>
            <td class="px-4 py-3">{{ item.status }}</td>
            <td class="px-4 py-3">{{ item.note || '-' }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">Belum ada history absensi</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>
  </section>
</template>
