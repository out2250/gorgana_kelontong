import type { RouteRecordRaw } from "vue-router";

import { ROUTE_PATHS } from "@/constants/routes";
import MainLayout from "@/layouts/MainLayout.vue";
import DashboardPage from "@/features/dashboard/DashboardPage.vue";
import LoginPage from "@/features/auth/LoginPage.vue";
import SignupOwnerPage from "@/features/auth/SignupOwnerPage.vue";
import AccessPendingPage from "@/features/auth/AccessPendingPage.vue";
import POSPage from "@/features/pos/POSPage.vue";
import ShiftPage from "@/features/shifts/ShiftPage.vue";
import InventoryPage from "@/features/inventory/InventoryPage.vue";
import BrandMasterPage from "@/features/inventory/BrandMasterPage.vue";
import SupplierMasterPage from "@/features/inventory/SupplierMasterPage.vue";
import CategoryMasterPage from "@/features/inventory/CategoryMasterPage.vue";
import PurchasePage from "@/features/purchases/PurchasePage.vue";
import StockOpnamePage from "@/features/stock-opname/StockOpnamePage.vue";
import SalesPage from "@/features/sales/SalesPage.vue";
import FinancePage from "@/features/finance/FinancePage.vue";
import PromotionsPage from "@/features/promotions/PromotionsPage.vue";
import SettingsPage from "@/features/settings/SettingsPage.vue";
import UsersPage from "@/features/users/UsersPage.vue";
import LeaveRequestsPage from "@/features/users/LeaveRequestsPage.vue";
import LeaveApprovalsPage from "@/features/users/LeaveApprovalsPage.vue";
import AbsentCorrectionsPage from "@/features/users/AbsentCorrectionsPage.vue";
import AbsentHistoryPage from "@/features/users/AbsentHistoryPage.vue";
import OvertimeManagementPage from "@/features/users/OvertimeManagementPage.vue";
import AdminSubscriptionsPage from "@/features/admin/AdminSubscriptionsPage.vue";
import TenantStoreDetailPage from "@/features/tenant/TenantStoreDetailPage.vue";
import AdminSubscriptionPricingPage from "@/features/admin/AdminSubscriptionPricingPage.vue";

export const routes: RouteRecordRaw[] = [
  {
    path: ROUTE_PATHS.login,
    name: "login",
    component: LoginPage,
    meta: { title: "Login" }
  },
  {
    path: ROUTE_PATHS.signupOwner,
    name: "signup-owner",
    component: SignupOwnerPage,
    meta: { title: "Daftar Owner" }
  },
  {
    path: ROUTE_PATHS.accessPending,
    name: "access-pending",
    component: AccessPendingPage,
    meta: { title: "Akses Menunggu Persetujuan" }
  },
  {
    path: ROUTE_PATHS.dashboard,
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      { path: "", name: "dashboard", component: DashboardPage, meta: { title: "Dashboard" } },
      {
        path: ROUTE_PATHS.pos.slice(1),
        name: "pos",
        component: POSPage,
        meta: { title: "POS Kasir", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.shifts.slice(1),
        name: "shifts",
        component: ShiftPage,
        meta: { title: "Shift Kasir", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.inventory.slice(1),
        name: "inventory",
        component: InventoryPage,
        meta: { title: "Inventory", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.inventoryBrandMaster.slice(1),
        name: "inventory-brand-master",
        component: BrandMasterPage,
        meta: { title: "Brand Master", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.inventorySupplierMaster.slice(1),
        name: "inventory-supplier-master",
        component: SupplierMasterPage,
        meta: { title: "Supplier Master", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.inventoryCategoryMaster.slice(1),
        name: "inventory-category-master",
        component: CategoryMasterPage,
        meta: { title: "Category Master", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.purchases.slice(1),
        name: "purchases",
        component: PurchasePage,
        meta: { title: "Purchase", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.stockOpname.slice(1),
        name: "stock-opname",
        component: StockOpnamePage,
        meta: { title: "Stock Opname", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.sales.slice(1),
        name: "sales",
        component: SalesPage,
        meta: { title: "Sales", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.finance.slice(1),
        name: "finance",
        component: FinancePage,
        meta: { title: "Finance", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.promotions.slice(1),
        name: "promotions",
        component: PromotionsPage,
        meta: { title: "Promotions", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.settings.slice(1),
        name: "settings",
        component: SettingsPage,
        meta: { title: "Settings", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.users.slice(1),
        name: "users",
        component: UsersPage,
        meta: { title: "User Management", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.usersLeaveRequests.slice(1),
        name: "users-leave-requests",
        component: LeaveRequestsPage,
        meta: { title: "Leave Requests", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.usersLeaveApprovals.slice(1),
        name: "users-leave-approvals",
        component: LeaveApprovalsPage,
        meta: { title: "Leave Approvals", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.usersAbsentCorrections.slice(1),
        name: "users-absent-corrections",
        component: AbsentCorrectionsPage,
        meta: { title: "Absent Corrections", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.usersAbsentHistory.slice(1),
        name: "users-absent-history",
        component: AbsentHistoryPage,
        meta: { title: "Absent History", requiresRoles: ["owner", "manager", "cashier"] }
      },
      {
        path: ROUTE_PATHS.usersOvertime.slice(1),
        name: "users-overtime",
        component: OvertimeManagementPage,
        meta: { title: "Overtime Management", requiresRoles: ["owner", "manager"] }
      },
      {
        path: ROUTE_PATHS.adminSubscriptions.slice(1),
        name: "admin-subscriptions",
        component: AdminSubscriptionsPage,
        meta: { title: "Admin Subscriptions", requiresSuperAdmin: true }
      },
      {
        path: ROUTE_PATHS.adminSubscriptionPricing.slice(1),
        name: "admin-subscription-pricing",
        component: AdminSubscriptionPricingPage,
        meta: { title: "Pricing Subscription", requiresSuperAdmin: true }
      },
      {
        path: ROUTE_PATHS.tenantStoreDetail.slice(1),
        name: "tenant-store-detail",
        component: TenantStoreDetailPage,
        meta: { title: "Tenant / Store Detail", requiresRoles: ["owner"] }
      }
    ]
  }
];
