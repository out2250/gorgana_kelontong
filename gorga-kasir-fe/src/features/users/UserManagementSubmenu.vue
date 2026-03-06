<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";

import { ROUTE_PATHS } from "@/constants/routes";
import { useAuthStore } from "@/store/auth";

const route = useRoute();
const auth = useAuthStore();

const isApprover = computed(() => Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner" || auth.user?.role === "manager"));
const isCashier = computed(() => auth.user?.role === "cashier" && !auth.user?.isSuperAdmin);

const menus = computed(() => {
  const base = isCashier.value
    ? [
      { to: ROUTE_PATHS.usersLeaveRequests, label: "Leave Requests" },
      { to: ROUTE_PATHS.usersAbsentHistory, label: "Absent History" }
    ]
    : [
      { to: ROUTE_PATHS.users, label: "User Management" },
      { to: ROUTE_PATHS.usersLeaveRequests, label: "Leave Requests" },
      { to: ROUTE_PATHS.usersAbsentHistory, label: "Absent History" }
    ];

  if (isApprover.value) {
    return [
      ...base,
      { to: ROUTE_PATHS.usersLeaveApprovals, label: "Leave Approvals" },
      { to: ROUTE_PATHS.usersAbsentCorrections, label: "Absent Corrections" },
      { to: ROUTE_PATHS.usersOvertime, label: "Overtime Management" }
    ];
  }

  return [
    ...base,
    { to: ROUTE_PATHS.usersAbsentCorrections, label: "Absent Corrections" }
  ];
});

function isActive(path: string) {
  return route.path === path;
}
</script>

<template>
  <div class="mt-3 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
    <RouterLink
      v-for="menu in menus"
      :key="menu.to"
      :to="menu.to"
      class="rounded-lg px-3 py-2 text-xs"
      :class="isActive(menu.to) ? 'bg-blue-700 text-white' : 'border border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-700'"
    >
      {{ menu.label }}
    </RouterLink>
  </div>
</template>
