import axios from "axios";

import { useAuthStore } from "@/store/auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ACCESS_EXPIRES_AT_KEY = "access_token_expires_at";
const DEVICE_ID_KEY = "device_id";

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers["x-device-id"] = getDeviceId();
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((callback) => callback(token));
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
      try {
        const auth = useAuthStore();
        auth.logout();
      } catch {
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post<AuthSessionResponse>(
        `${api.defaults.baseURL}/auth/refresh`,
        { refreshToken }
      );

      localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      localStorage.setItem(ACCESS_EXPIRES_AT_KEY, data.accessTokenExpiresAt);

      try {
        const auth = useAuthStore();
        auth.updateAccessSession(data.accessToken, data.accessTokenExpiresAt, data.refreshToken);
      } catch {
      }

      flushQueue(data.accessToken);

      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      flushQueue(null);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
      try {
        const auth = useAuthStore();
        auth.logout();
      } catch {
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export type AuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isSuperAdmin?: boolean;
    tenantId: string;
    address?: string | null;
    phoneNumber?: string | null;
    profileImageUrl?: string | null;
  };
};

export type MeResponse = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  tenantId: string;
  address?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
  mfaEnabled?: boolean;
  stores: Array<{ id: string; name: string }>;
  subscription: {
    plan: string;
    status: "trial" | "active" | "past_due" | "inactive";
    paymentStatus: "paid" | "unpaid";
    startsAt: string;
    endsAt: string | null;
    daysLeft: number | null;
    isExpired: boolean;
  } | null;
};

export type StoreDto = {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

export type UserDto = {
  id: string;
  username?: string | null;
  fullName: string;
  email: string;
  role: "owner" | "manager" | "cashier";
  address?: string | null;
  phoneNumber?: string | null;
  jobResponsibility?: string | null;
  conditionStatus?: "on_duty" | "on_leave" | "sick" | "on_penalty";
  attendanceStatus?: "present" | "absent" | "late" | "off";
  scheduleLabel?: string | null;
  scheduleStartTime?: string | null;
  scheduleEndTime?: string | null;
  isActive: boolean;
  stores: Array<{ id: string; name: string }>;
};

export type ProductDto = {
  id: string;
  storeId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unitMeasure: "mL" | "L" | "mG" | "KG" | null;
  unitValue: string;
  sellCategories: string[] | null;
  sellPrice: string;
  minimumStock: number;
  stockOnHand: number;
};

export type CategoryDto = {
  id: string;
  tenantId: string;
  name: string;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string } | null;
};

export type BrandDto = {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SupplierDto = {
  id: string;
  tenantId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PromoDto = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discountPercent: number;
  category?: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FinanceSummary = {
  salesTotal: number;
  expenseTotal: number;
  grossProfitEstimate: number;
};

export type ApAgingItem = {
  id: string;
  purchasedAt: string;
  invoiceNumber?: string | null;
  supplier: { id: string; name: string };
  store: { id: string; name: string };
  totalAmount: number;
  outstandingAmount: number;
  isSettled: boolean;
  ageDays: number;
  bucket: "0-30" | "31-60" | "61-90" | ">90";
};

export type ApAgingResponse = {
  items: ApAgingItem[];
  summary: {
    totalOutstanding: number;
    byBucket: Record<"0-30" | "31-60" | "61-90" | ">90", number>;
  };
  pagination: PaginationMeta;
};

export type PeriodClosingResponse = {
  closedThroughAt: string | null;
  inventoryCostingMethod?: "weighted_average" | "fifo";
  closureHistory: Array<{
    closedAt: string;
    closedThroughAt: string;
    closedByUserId: string;
  }>;
};

export type DashboardSummary = {
  period: "daily" | "weekly";
  rangeStart: string;
  rangeEnd: string;
  date: string;
  salesTotal: number;
  expenseTotal: number;
  grossProfitEstimate: number;
  transactionCount: number;
  lowStockCount: number;
  lowStockItems: Array<{
    id: string;
    sku: string;
    name: string;
    stockOnHand: number;
    minimumStock: number;
    avgDailySales: number;
    recommendedRestockQty: number;
  }>;
  topProducts: Array<{
    id: string;
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  slowMovingProducts: Array<{
    id: string;
    sku: string;
    name: string;
    stockOnHand: number;
    daysWithoutSale: number | null;
  }>;
  busyHours: Array<{
    hour: number;
    transactions: number;
  }>;
  categoryMargins: Array<{
    category: string;
    revenue: number;
    estimatedCost: number;
    grossMargin: number;
  }>;
};

export type ExpenseDto = {
  id: string;
  title: string;
  amount: string;
  notes: string | null;
  spentAt: string;
};

export type TicketDto = {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: "open" | "in_progress" | "resolved";
};

export type SaleDto = {
  id: string;
  storeId: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  paidAmount?: string | null;
  changeAmount?: string | null;
  subtotal: string;
  discount: string;
  promoCode?: string | null;
  promoDiscount?: string | null;
  total: string;
  soldAt: string;
  store: { id: string; name: string };
  cashier: { id: string; fullName: string; email: string };
};

export type SaleDetailDto = SaleDto & {
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    discount: string;
    lineTotal: string;
    product: {
      id: string;
      sku: string;
      name: string;
    };
  }>;
};

export type SubscriptionAdminItem = {
  id: string;
  name: string;
  status?: "pending_approval" | "active" | "rejected" | "inactive";
  fullName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  usersCount: number;
  storesCount: number;
  subscription: {
    id: string;
    plan: string;
    status: "trial" | "active" | "past_due" | "inactive";
    requestStatus?: "approve" | "refund" | "force_inactive" | "rejected" | null;
    paymentStatus?: "paid" | "unpaid";
    trialEnabled?: boolean;
    startsAt: string;
    endsAt: string | null;
  } | null;
};

export type TenantStoreDetail = {
  tenant: {
    id: string;
    name: string;
    ownerName: string;
    address: string;
    contactPhone: string;
    npwp: string;
    importantInfo: string;
  };
  stores: Array<{
    id: string;
    name: string;
    address: string | null;
    isActive: boolean;
  }>;
};

export type SubscriptionPricingPackage = {
  id: string;
  label: string;
  months: number;
  discountPercent: number;
  freeMonths: number;
  isActive: boolean;
  grossPrice?: number;
  discountAmount?: number;
  finalPrice?: number;
  effectiveMonths?: number;
  effectiveMonthlyPrice?: number;
};

export type SubscriptionPricingSettings = {
  baseMonthlyPrice: number;
  promoNote?: string;
  updatedAt?: string;
  packages: SubscriptionPricingPackage[];
};

export type LeaveRequestDto = {
  id: string;
  userId: string;
  userName: string;
  type: "leave" | "sick";
  startDate: string;
  endDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
};

export type AbsentCorrectionDto = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
};

export type AttendanceLogDto = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startAt?: string;
  endAt?: string;
  status: "started" | "completed" | "blocked_leave";
  note?: string;
  overtimeAssignmentId?: string;
  createdAt: string;
};

export type OvertimeAssignmentDto = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
  status: "assigned" | "completed" | "cancelled";
  assignedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceTodayStatusDto = {
  today: string;
  needsStartDayPopup: boolean;
  canStartDay: boolean;
  blockReason: string;
  todayLog: AttendanceLogDto | null;
  activeOvertime: OvertimeAssignmentDto | null;
};

export type OwnerSignupPayload = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  tenantName: string;
  address: string;
  fullName: string;
  dateOfBirth?: string;
  contactPhone: string;
  additionalData?: Record<string, unknown>;
  plan?: string;
};

export type ShiftDto = {
  id: string;
  tenantId: string;
  storeId: string;
  openedByUserId: string;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  cashDifference: string | null;
  notes: string | null;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  store: { id: string; name: string };
  user: { id: string; fullName: string; email: string };
};

export type ShiftRecapItemDto = {
  date: string;
  cashier: { id: string; fullName: string; email: string };
  store: { id: string; name: string };
  shiftCount: number;
  totalOpeningCash: number;
  totalExpectedCash: number;
  totalClosingCash: number;
  totalDifference: number;
};

export type ShiftRecapResponseDto = {
  items: ShiftRecapItemDto[];
  summary: {
    shiftCount: number;
    totalOpeningCash: number;
    totalExpectedCash: number;
    totalClosingCash: number;
    totalDifference: number;
  };
};

export type PurchaseDto = {
  id: string;
  storeId: string;
  supplierName: string;
  invoiceNumber: string | null;
  notes: string | null;
  purchasedAt: string;
  createdAt: string;
  store: { id: string; name: string };
  user: { id: string; fullName: string; email: string };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    receivedQuantity?: number;
    remainingQuantity?: number;
    unitCost: string;
    lineTotal: string;
    product: { id: string; sku: string; name: string };
  }>;
};

export type PurchaseReceiveResponse = {
  status: "received";
  purchaseId: string;
  items: Array<{
    productId: string;
    orderedQuantity: number;
    receivedQuantity: number;
    remainingQuantity: number;
  }>;
};

export type StockOpnameStatus = "open" | "submitted" | "approved" | "rejected";

export type StockOpnameSessionDto = {
  id: string;
  tenantId: string;
  storeId: string;
  createdBy: string;
  assignedTo: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  approvedBy: string | null;
  status: StockOpnameStatus;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: { id: string; name: string };
  creator: { id: string; fullName: string; email: string };
  assignee?: { id: string; fullName: string; email: string } | null;
  assigner?: { id: string; fullName: string; email: string } | null;
  approver?: { id: string; fullName: string; email: string } | null;
};

export type StockOpnameDetailDto = StockOpnameSessionDto & {
  items: Array<{
    id: string;
    productId: string;
    systemStock: number;
    countedStock: number;
    difference: number;
    product: { id: string; sku: string; name: string };
  }>;
};

export type ListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export type LoginMfaRequiredResponse = {
  mfaRequired: true;
  challengeId: string;
  message?: string;
};

export async function login(payload: { email: string; password: string }) {
  const { data } = await api.post<AuthSessionResponse | LoginMfaRequiredResponse>("/auth/login", payload);
  return data;
}

export async function verifyLoginOtp(payload: { challengeId: string; code: string }) {
  const { data } = await api.post<AuthSessionResponse>("/auth/login/verify-otp", payload);
  return data;
}

export async function refreshSession(payload: { refreshToken: string }) {
  const { data } = await api.post<AuthSessionResponse>("/auth/refresh", payload);
  return data;
}

export async function logoutSession(payload: { refreshToken: string }) {
  const { data } = await api.post("/auth/logout", payload);
  return data;
}

export async function getMe() {
  const { data } = await api.get<MeResponse>("/auth/me");
  return data;
}

export async function updateMyProfile(payload: {
  fullName: string;
  address?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
}) {
  const { data } = await api.patch<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    tenantId: string;
    address?: string | null;
    phoneNumber?: string | null;
    profileImageUrl?: string | null;
  }>("/auth/me", payload);
  return data;
}

export async function uploadProfileImage(payload: {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}) {
  const { data } = await api.post<{ imageUrl: string }>("/auth/profile-image/upload", payload);
  return data;
}

export async function setupMfa() {
  const { data } = await api.post<{ secret: string; otpauthUrl: string }>("/auth/mfa/setup");
  return data;
}

export async function enableMfa(payload: { code: string }) {
  const { data } = await api.post<{ status: string }>("/auth/mfa/enable", payload);
  return data;
}

export async function disableMfa() {
  const { data } = await api.post<{ status: string }>("/auth/mfa/disable");
  return data;
}

export async function getStores(params?: ListQuery & { isActive?: boolean }) {
  const { data } = await api.get<PaginatedResponse<StoreDto>>("/stores", { params });
  return data;
}

export async function createStore(payload: { name: string; address?: string }) {
  const { data } = await api.post<StoreDto>("/stores", payload);
  return data;
}

export async function getUsers(
  params?: ListQuery & {
    storeId?: string;
    role?: string;
    isActive?: boolean;
    conditionStatus?: "on_duty" | "on_leave" | "sick" | "on_penalty";
    attendanceStatus?: "present" | "absent" | "late" | "off";
  }
) {
  const { data } = await api.get<PaginatedResponse<UserDto>>("/users", { params });
  return data;
}

export async function createUser(payload: {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: "owner" | "manager" | "cashier";
  address?: string;
  phoneNumber?: string;
  jobResponsibility: string;
  conditionStatus?: "on_duty" | "on_leave" | "sick" | "on_penalty";
  attendanceStatus?: "present" | "absent" | "late" | "off";
  scheduleLabel?: string;
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  storeIds: string[];
}) {
  const { data } = await api.post("/users", payload);
  return data;
}

export async function updateUserEmployment(
  userId: string,
  payload: {
    isActive?: boolean;
    conditionStatus?: "on_duty" | "on_leave" | "sick" | "on_penalty";
    attendanceStatus?: "present" | "absent" | "late" | "off";
    scheduleLabel?: string;
    scheduleStartTime?: string;
    scheduleEndTime?: string;
  }
) {
  const { data } = await api.patch(`/users/${userId}/employment`, payload);
  return data;
}

export async function getMyLeaveRequests(params?: {
  status?: "pending" | "approved" | "rejected";
  type?: "leave" | "sick";
}) {
  const { data } = await api.get<{ items: LeaveRequestDto[] }>("/hr/leave-requests/me", { params });
  return data;
}

export async function createLeaveRequest(payload: {
  type: "leave" | "sick";
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const { data } = await api.post<LeaveRequestDto>("/hr/leave-requests", payload);
  return data;
}

export async function getLeaveApprovals(params?: {
  status?: "pending" | "approved" | "rejected";
  type?: "leave" | "sick";
}) {
  const { data } = await api.get<{ items: LeaveRequestDto[] }>("/hr/leave-requests/approvals", { params });
  return data;
}

export async function decideLeaveRequest(id: string, payload: { decision: "approved" | "rejected"; note?: string }) {
  const { data } = await api.post<LeaveRequestDto>(`/hr/leave-requests/${id}/decision`, payload);
  return data;
}

export async function getAbsentCorrections() {
  const { data } = await api.get<{ items: AbsentCorrectionDto[] }>("/hr/absent-corrections");
  return data;
}

export async function createAbsentCorrection(payload: {
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
}) {
  const { data } = await api.post<AbsentCorrectionDto>("/hr/absent-corrections", payload);
  return data;
}

export async function decideAbsentCorrection(id: string, payload: { decision: "approved" | "rejected"; note?: string }) {
  const { data } = await api.post<AbsentCorrectionDto>(`/hr/absent-corrections/${id}/decision`, payload);
  return data;
}

export async function getAttendanceTodayStatus() {
  const { data } = await api.get<AttendanceTodayStatusDto>("/hr/attendance/today-status");
  return data;
}

export async function startDay() {
  const { data } = await api.post<AttendanceLogDto>("/hr/attendance/start-day");
  return data;
}

export async function endDay(payload?: { force?: boolean }) {
  const { data } = await api.post<AttendanceLogDto>("/hr/attendance/end-day", payload ?? {});
  return data;
}

export async function getAttendanceHistory(params?: {
  page?: number;
  pageSize?: number;
  userId?: string;
  date?: string;
}) {
  const { data } = await api.get<PaginatedResponse<AttendanceLogDto>>("/hr/attendance/history", { params });
  return data;
}

export async function getOvertimeAssignments(params?: {
  status?: "assigned" | "completed" | "cancelled";
  userId?: string;
}) {
  const { data } = await api.get<{ items: OvertimeAssignmentDto[] }>("/hr/overtime", { params });
  return data;
}

export async function assignOvertime(payload: {
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  note?: string;
}) {
  const { data } = await api.post<OvertimeAssignmentDto>("/hr/overtime", payload);
  return data;
}

export async function updateOvertimeStatus(id: string, payload: { status: "assigned" | "completed" | "cancelled" }) {
  const { data } = await api.patch<OvertimeAssignmentDto>(`/hr/overtime/${id}/status`, payload);
  return data;
}

export async function getProducts(params?: ListQuery & { storeId?: string; category?: string }) {
  const { data } = await api.get<PaginatedResponse<ProductDto>>("/products", {
    params
  });
  return data;
}

export async function getPromos(params?: { search?: string; category?: string; onlyActive?: boolean; at?: string }) {
  const { data } = await api.get<{ items: PromoDto[] }>("/promos", { params });
  return data;
}

export async function getCategories(params?: ListQuery & { search?: string; isActive?: boolean }) {
  const { data } = await api.get<PaginatedResponse<CategoryDto>>("/catalog/categories", { params });
  return data;
}

export async function getBrands(params?: ListQuery & { search?: string; isActive?: boolean }) {
  const { data } = await api.get<PaginatedResponse<BrandDto>>("/catalog/brands", { params });
  return data;
}

export async function getSuppliers(params?: ListQuery & { search?: string; isActive?: boolean }) {
  const { data } = await api.get<PaginatedResponse<SupplierDto>>("/catalog/suppliers", { params });
  return data;
}

export async function createCategory(payload: { name: string; parentId?: string; isActive?: boolean }) {
  const { data } = await api.post<CategoryDto>("/catalog/categories", payload);
  return data;
}

export async function createBrand(payload: { name: string; isActive?: boolean }) {
  const { data } = await api.post<BrandDto>("/catalog/brands", payload);
  return data;
}

export async function createSupplier(payload: { name: string; phone?: string; address?: string; isActive?: boolean }) {
  const { data } = await api.post<SupplierDto>("/catalog/suppliers", payload);
  return data;
}

export async function createPromo(payload: {
  code: string;
  name: string;
  description?: string;
  discountPercent: number;
  category?: string;
  startAt: string;
  endAt: string;
  isActive?: boolean;
}) {
  const { data } = await api.post<PromoDto>("/promos", payload);
  return data;
}

export async function updatePromoStatus(id: string, isActive: boolean) {
  const { data } = await api.patch<PromoDto>(`/promos/${id}/status`, { isActive });
  return data;
}

export async function postStockMovement(payload: {
  storeId: string;
  productId: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  reason?: string;
}) {
  const { data } = await api.post("/stock/movements", payload);
  return data;
}

export async function createProduct(payload: {
  storeId: string;
  name: string;
  barcode?: string;
  category?: "cair" | "padat";
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  supplierPrice?: number;
  leadTimeDays?: number;
  unitMeasure: "mL" | "L" | "mG" | "KG";
  unitValue: number;
  sellCategories: string[];
  sellPrice: number;
  minimumStock: number;
  stockOnHand: number;
}) {
  const { data } = await api.post("/products", payload);
  return data;
}

export async function adjustProduct(
  productId: string,
  payload: {
    barcode?: string;
    sellPrice?: number;
    minimumStock?: number;
    stockOnHand?: number;
    category?: "cair" | "padat";
    categoryId?: string;
    brandId?: string;
    unitMeasure?: "mL" | "L" | "mG" | "KG";
    unitValue?: number;
    sellCategories?: string[];
  }
) {
  const { data } = await api.patch(`/products/${productId}/adjustment`, payload);
  return data;
}

export async function getPurchases(
  params?: ListQuery & { storeId?: string; startDate?: string; endDate?: string }
) {
  const { data } = await api.get<PaginatedResponse<PurchaseDto>>("/purchases", {
    params
  });
  return data;
}

export async function createPurchase(payload: {
  storeId: string;
  supplierId: string;
  invoiceNumber?: string;
  notes?: string;
  receiveNow?: boolean;
  purchasedAt: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
}) {
  const { data } = await api.post<PurchaseDto>("/purchases", payload);
  return data;
}

export async function receivePurchaseItems(
  purchaseId: string,
  payload: {
    items: Array<{
      productId: string;
      quantity: number;
    }>;
  }
) {
  const { data } = await api.post<PurchaseReceiveResponse>(`/purchases/${purchaseId}/receive`, payload);
  return data;
}

export async function getStockOpnameSessions(
  params?: ListQuery & {
    sessionId?: string;
    storeId?: string;
    status?: StockOpnameStatus;
    startDate?: string;
    endDate?: string;
  }
) {
  const { data } = await api.get<PaginatedResponse<StockOpnameSessionDto>>("/stock-opname/sessions", {
    params
  });
  return data;
}

export async function createStockOpnameSession(payload: { storeId: string; notes?: string; assignedTo?: string }) {
  const { data } = await api.post<StockOpnameSessionDto>("/stock-opname/sessions", payload);
  return data;
}

export async function assignStockOpnameSession(sessionId: string, assignedTo: string) {
  const { data } = await api.patch<StockOpnameSessionDto>(`/stock-opname/sessions/${sessionId}/assign`, {
    assignedTo
  });
  return data;
}

export async function getStockOpnameSessionDetail(sessionId: string) {
  const { data } = await api.get<StockOpnameDetailDto>(`/stock-opname/sessions/${sessionId}`);
  return data;
}

export async function saveStockOpnameItems(payload: {
  sessionId: string;
  items: Array<{ productId: string; countedStock: number }>;
}) {
  const { data } = await api.post<{ status: "saved" }>(`/stock-opname/sessions/${payload.sessionId}/items`, {
    items: payload.items
  });
  return data;
}

export async function submitStockOpnameSession(sessionId: string) {
  const { data } = await api.post<{ status: "submitted" }>(`/stock-opname/sessions/${sessionId}/submit`);
  return data;
}

export async function approveStockOpnameSession(sessionId: string) {
  const { data } = await api.post<{ status: "approved" }>(`/stock-opname/sessions/${sessionId}/approve`);
  return data;
}

export async function getFinanceSummary(storeId?: string) {
  const { data } = await api.get<FinanceSummary>("/finance/summary", {
    params: storeId ? { storeId } : undefined
  });
  return data;
}

export async function getApAging(params?: { storeId?: string; page?: number; pageSize?: number }) {
  const { data } = await api.get<ApAgingResponse>("/finance/ap-aging", { params });
  return data;
}

export async function settleApPurchase(purchaseId: string) {
  const { data } = await api.post<{ status: "settled"; purchaseId: string }>(`/finance/ap-aging/${purchaseId}/settle`);
  return data;
}

export async function getPeriodClosingStatus() {
  const { data } = await api.get<PeriodClosingResponse>("/finance/period-closing");
  return data;
}

export async function closeFinancePeriod(closeThroughAt: string) {
  const { data } = await api.post<{ status: "closed"; closedThroughAt: string }>("/finance/period-closing/close", {
    closeThroughAt
  });
  return data;
}

export async function updateInventoryCostingMethod(inventoryCostingMethod: "weighted_average" | "fifo") {
  const { data } = await api.post<{ status: "updated"; inventoryCostingMethod: "weighted_average" | "fifo" }>(
    "/finance/costing-method",
    { inventoryCostingMethod }
  );
  return data;
}

export async function getDashboardSummary(params?: { storeId?: string; date?: string; period?: "daily" | "weekly" }) {
  const { data } = await api.get<DashboardSummary>("/dashboard/summary", { params });
  return data;
}

export async function getSales(params?: ListQuery & { storeId?: string; startDate?: string; endDate?: string }) {
  const { data } = await api.get<PaginatedResponse<SaleDto>>("/sales", { params });
  return data;
}

export async function postSale(payload: {
  idempotencyKey?: string;
  storeId: string;
  paymentMethod: string;
  paymentBreakdown?: {
    cash: number;
    qris: number;
    transfer: number;
  };
  referenceNumber?: string;
  paidAmount?: number;
  soldAt: string;
  promoCode?: string;
  discount: number;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
}) {
  const { data } = await api.post("/sales", payload);
  return data;
}

export async function returnSale(payload: { saleId: string; reason?: string }) {
  const { data } = await api.post(`/sales/${payload.saleId}/return`, {
    reason: payload.reason
  });
  return data as {
    status: "returned";
    saleId: string;
    returnedItems: number;
  };
}

export async function getSaleDetail(saleId: string) {
  const { data } = await api.get<SaleDetailDto>(`/sales/${saleId}`);
  return data;
}

export async function returnSalePartial(payload: {
  saleId: string;
  reason?: string;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const { data } = await api.post(`/sales/${payload.saleId}/return-partial`, {
    reason: payload.reason,
    items: payload.items
  });

  return data as {
    status: "partial_returned";
    saleId: string;
    returnedItems: number;
  };
}

export async function getExpenses(params?: ListQuery & { storeId?: string }) {
  const { data } = await api.get<PaginatedResponse<ExpenseDto>>("/expenses", {
    params
  });
  return data;
}

export async function createExpense(payload: {
  storeId: string;
  title: string;
  amount: number;
  notes?: string;
}) {
  const { data } = await api.post("/expenses", payload);
  return data;
}

export async function getTickets(params?: ListQuery & { storeId?: string; status?: string; priority?: string }) {
  const { data } = await api.get<PaginatedResponse<TicketDto>>("/support/tickets", {
    params
  });
  return data;
}

export async function createTicket(payload: {
  storeId: string;
  title: string;
  description: string;
  priority: string;
}) {
  const { data } = await api.post("/support/tickets", payload);
  return data;
}

export async function updateTicketStatus(id: string, status: "open" | "in_progress" | "resolved") {
  const { data } = await api.patch(`/support/tickets/${id}/status`, { status });
  return data;
}

export async function postSyncSale(payload: unknown) {
  const { data } = await api.post("/sync/sales", payload);
  return data;
}

export async function getAdminSubscriptions(
  params?: ListQuery & {
    status?: "trial" | "active" | "past_due" | "inactive";
    paymentStatus?: "paid" | "unpaid";
    tenantStatus?: "pending_approval" | "active" | "rejected" | "inactive";
  }
) {
  const { data } = await api.get<PaginatedResponse<SubscriptionAdminItem>>("/admin/subscriptions", {
    params
  });
  return data;
}

export async function updateAdminTenantSubscription(
  tenantId: string,
  payload: {
    plan: string;
    status: "trial" | "active" | "past_due" | "inactive";
    paymentStatus?: "paid" | "unpaid";
    trialEnabled?: boolean;
    endsAt?: string;
  }
) {
  const { data } = await api.patch(`/admin/tenants/${tenantId}/subscription`, payload);
  return data;
}

export async function approveTenantSubscription(tenantId: string) {
  const { data } = await api.post<{ status: "approved" }>(`/admin/subscription-approvals/${tenantId}/approve`);
  return data;
}

export async function rejectTenantSubscription(tenantId: string, reason: string) {
  const { data } = await api.post<{ status: "rejected" }>(`/admin/subscription-approvals/${tenantId}/reject`, {
    reason
  });
  return data;
}

export async function refundTenantSubscription(tenantId: string, reason?: string) {
  const { data } = await api.post<{ status: "refund" }>(`/admin/subscription-approvals/${tenantId}/refund`, {
    reason
  });
  return data;
}

export async function forceInactiveTenantSubscription(tenantId: string, reason?: string) {
  const { data } = await api.post<{ status: "force_inactive" }>(`/admin/subscription-approvals/${tenantId}/force-inactive`, {
    reason
  });
  return data;
}

export async function setTenantTrialAccess(tenantId: string, enabled: boolean) {
  const { data } = await api.patch(`/admin/tenants/${tenantId}/trial-access`, {
    enabled
  });
  return data;
}

export async function getTenantStoreDetail() {
  const { data } = await api.get<TenantStoreDetail>("/tenant-store-detail");
  return data;
}

export async function updateTenantStoreDetail(payload: {
  tenantName: string;
  ownerName: string;
  tenantAddress: string;
  contactPhone: string;
  npwp?: string;
  importantInfo?: string;
  stores: Array<{
    id: string;
    name: string;
    address?: string;
  }>;
}) {
  const { data } = await api.patch<{ status: "updated" }>("/tenant-store-detail", payload);
  return data;
}

export async function getAdminTenantStoreDetail(tenantId: string) {
  const { data } = await api.get<TenantStoreDetail>(`/admin/tenants/${tenantId}/detail`);
  return data;
}

export async function getSubscriptionPricingSettings() {
  const { data } = await api.get<SubscriptionPricingSettings>("/admin/subscription-pricing");
  return data;
}

export async function updateSubscriptionPricingSettings(payload: {
  baseMonthlyPrice: number;
  promoNote?: string;
  packages: Array<{
    id: string;
    label: string;
    months: number;
    discountPercent: number;
    freeMonths: number;
    isActive: boolean;
  }>;
}) {
  const { data } = await api.put<SubscriptionPricingSettings>("/admin/subscription-pricing", payload);
  return data;
}

export async function getPublicSubscriptionPlans() {
  const { data } = await api.get<SubscriptionPricingSettings>("/auth/subscription-plans");
  return data;
}

export async function signupOwner(payload: OwnerSignupPayload) {
  const { data } = await api.post<{
    status: "PENDING_APPROVAL";
    tenantId: string;
    ownerId: string;
    message: string;
  }>("/auth/signup-owner", payload);
  return data;
}

export async function getCurrentShift(storeId: string) {
  const { data } = await api.get<ShiftDto | null>("/shifts/current", {
    params: { storeId }
  });
  return data;
}

export async function getShiftHistory(
  params?: ListQuery & {
    storeId?: string;
    status?: "open" | "closed";
    startDate?: string;
    endDate?: string;
  }
) {
  const { data } = await api.get<PaginatedResponse<ShiftDto>>("/shifts/history", {
    params
  });
  return data;
}

export async function openShift(payload: { storeId: string; openingCash: number }) {
  const { data } = await api.post<ShiftDto>("/shifts/open", payload);
  return data;
}

export async function closeShift(payload: { shiftId: string; closingCash: number; notes?: string }) {
  const { data } = await api.post<ShiftDto & { salesTotal: number }>(`/shifts/${payload.shiftId}/close`, {
    closingCash: payload.closingCash,
    notes: payload.notes
  });
  return data;
}

export async function getShiftRecap(params?: { storeId?: string; startDate?: string; endDate?: string }) {
  const { data } = await api.get<ShiftRecapResponseDto>("/shifts/recap", {
    params
  });
  return data;
}
