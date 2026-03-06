<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, RouterLink } from "vue-router";

import BrandLogo from "@/components/BrandLogo.vue";
import { ROUTE_PATHS } from "@/constants/routes";
import { useAuthStore } from "@/store/auth";

const route = useRoute();
const auth = useAuthStore();
const inventoryExpanded = ref(true);
const userManagementExpanded = ref(true);

type MenuLink = {
  type: "link";
  to: string;
  label: string;
  roles: Array<"owner" | "manager" | "cashier">;
};

type MenuGroup = {
  type: "group";
  key: string;
  label: string;
  roles: Array<"owner" | "manager" | "cashier">;
  children: Array<{ to: string; label: string }>;
};

const baseMenus: Array<MenuLink | MenuGroup> = [
  { type: "link", to: ROUTE_PATHS.dashboard, label: "Dashboard", roles: ["owner", "manager", "cashier"] },
  { type: "link", to: ROUTE_PATHS.pos, label: "POS Kasir", roles: ["owner", "manager", "cashier"] },
  { type: "link", to: ROUTE_PATHS.shifts, label: "Shift Kasir", roles: ["owner", "manager", "cashier"] },
  {
    type: "group",
    key: "inventory",
    label: "Inventory",
    roles: ["owner", "manager"],
    children: [
      { to: ROUTE_PATHS.inventory, label: "Inventory" },
      { to: ROUTE_PATHS.inventoryBrandMaster, label: "Brand Master" },
      { to: ROUTE_PATHS.inventorySupplierMaster, label: "Supplier Master" },
      { to: ROUTE_PATHS.inventoryCategoryMaster, label: "Category Master" }
    ]
  },
  { type: "link", to: ROUTE_PATHS.purchases, label: "Purchase", roles: ["owner", "manager"] },
  { type: "link", to: ROUTE_PATHS.stockOpname, label: "Stock Opname", roles: ["owner", "manager", "cashier"] },
  { type: "link", to: ROUTE_PATHS.sales, label: "Sales", roles: ["owner", "manager", "cashier"] },
  { type: "link", to: ROUTE_PATHS.finance, label: "Finance", roles: ["owner", "manager"] },
  { type: "link", to: ROUTE_PATHS.promotions, label: "Promotions", roles: ["owner", "manager"] },
  { type: "link", to: ROUTE_PATHS.tenantStoreDetail, label: "Tenant / Store Detail", roles: ["owner"] },
  { type: "link", to: ROUTE_PATHS.settings, label: "Settings", roles: ["owner", "manager", "cashier"] },
  {
    type: "group",
    key: "user-management",
    label: "User Management",
    roles: ["owner", "manager", "cashier"],
    children: [
      { to: ROUTE_PATHS.users, label: "User Management" },
      { to: ROUTE_PATHS.usersLeaveRequests, label: "Leave Requests" },
      { to: ROUTE_PATHS.usersLeaveApprovals, label: "Leave Approvals" },
      { to: ROUTE_PATHS.usersAbsentCorrections, label: "Absent Corrections" },
      { to: ROUTE_PATHS.usersAbsentHistory, label: "Absent History" },
      { to: ROUTE_PATHS.usersOvertime, label: "Overtime Management" }
    ]
  }
];

const menus = computed(() => {
  if (auth.user?.isSuperAdmin) {
    return [
      ...baseMenus.map((menu) => {
        if (menu.type === "link") {
          return { type: "link" as const, to: menu.to, label: menu.label };
        }
        return { type: "group" as const, key: menu.key, label: menu.label, children: menu.children };
      }),
      { type: "link" as const, to: ROUTE_PATHS.adminSubscriptions, label: "Admin Subscription" },
      { type: "link" as const, to: ROUTE_PATHS.adminSubscriptionPricing, label: "Pricing Subscription" }
    ];
  }

  const role = auth.user?.role as "owner" | "manager" | "cashier" | undefined;
  return baseMenus
    .filter((menu) => role ? menu.roles.includes(role) : false)
    .map((menu) => {
      if (menu.type === "link") {
        return { type: "link" as const, to: menu.to, label: menu.label };
      }
      if (menu.key === "user-management" && role === "cashier") {
        const cashierAllowed = new Set<string>([
          ROUTE_PATHS.usersLeaveRequests,
          ROUTE_PATHS.usersAbsentCorrections,
          ROUTE_PATHS.usersAbsentHistory
        ]);
        return {
          type: "group" as const,
          key: menu.key,
          label: menu.label,
          children: menu.children.filter((child) => cashierAllowed.has(child.to))
        };
      }
      return { type: "group" as const, key: menu.key, label: menu.label, children: menu.children };
    });
});

const activePath = computed(() => route.path);

const inventoryPaths = new Set<string>([
  ROUTE_PATHS.inventory,
  ROUTE_PATHS.inventoryBrandMaster,
  ROUTE_PATHS.inventorySupplierMaster,
  ROUTE_PATHS.inventoryCategoryMaster
]);

const userManagementPaths = new Set<string>([
  ROUTE_PATHS.users,
  ROUTE_PATHS.usersLeaveRequests,
  ROUTE_PATHS.usersLeaveApprovals,
  ROUTE_PATHS.usersAbsentCorrections,
  ROUTE_PATHS.usersAbsentHistory,
  ROUTE_PATHS.usersOvertime
]);

function isMenuActive(path: string) {
  return activePath.value === path;
}

function isInventoryGroupActive() {
  return inventoryPaths.has(activePath.value);
}

function toggleInventoryExpanded() {
  inventoryExpanded.value = !inventoryExpanded.value;
}

function isUserManagementGroupActive() {
  return userManagementPaths.has(activePath.value);
}

function toggleUserManagementExpanded() {
  userManagementExpanded.value = !userManagementExpanded.value;
}
</script>

<template>
  <aside class="w-full border-r border-slate-200 bg-white p-3 md:w-64">
    <div class="mb-4 px-2">
      <BrandLogo />
    </div>

    <nav class="space-y-1">
      <template v-for="menu in menus" :key="menu.type === 'link' ? menu.to : menu.key">
        <RouterLink
          v-if="menu.type === 'link'"
          :to="menu.to"
          class="block rounded-lg px-3 py-2 text-sm"
          :class="isMenuActive(menu.to) ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'"
        >
          {{ menu.label }}
        </RouterLink>

        <div v-else-if="menu.key === 'inventory'" class="space-y-1">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm"
            :class="isInventoryGroupActive() ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'"
            @click="toggleInventoryExpanded"
          >
            <span>{{ menu.label }}</span>
            <span class="text-xs">{{ inventoryExpanded ? '▾' : '▸' }}</span>
          </button>

          <div v-if="inventoryExpanded" class="space-y-1 pl-3">
            <RouterLink
              v-for="child in menu.children"
              :key="child.to"
              :to="child.to"
              class="block rounded-lg px-3 py-2 text-sm"
              :class="isMenuActive(child.to) ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'"
            >
              {{ child.label }}
            </RouterLink>
          </div>
        </div>

        <div v-else class="space-y-1">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm"
            :class="isUserManagementGroupActive() ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'"
            @click="toggleUserManagementExpanded"
          >
            <span>{{ menu.label }}</span>
            <span class="text-xs">{{ userManagementExpanded ? '▾' : '▸' }}</span>
          </button>

          <div v-if="userManagementExpanded" class="space-y-1 pl-3">
            <RouterLink
              v-for="child in menu.children"
              :key="child.to"
              :to="child.to"
              class="block rounded-lg px-3 py-2 text-sm"
              :class="isMenuActive(child.to) ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'"
            >
              {{ child.label }}
            </RouterLink>
          </div>
        </div>
      </template>
    </nav>
  </aside>
</template>
