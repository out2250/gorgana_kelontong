<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageFilterBar from "@/components/PageFilterBar.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  createSupplier,
  createPurchase,
  getPeriodClosingStatus,
  getProducts,
  getPurchases,
  receivePurchaseItems,
  getStores,
  getSuppliers,
  type ProductDto,
  type PurchaseDto,
  type SupplierDto,
  type StoreDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const products = ref<ProductDto[]>([]);
const suppliers = ref<SupplierDto[]>([]);
const purchases = ref<PurchaseDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const creatingSupplier = ref(false);
const receivingPurchaseId = ref("");
const error = ref("");
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
const search = ref("");
const startDate = ref("");
const endDate = ref("");
const supplierLovOpen = ref(false);
const supplierLovSearch = ref("");
const inventoryCostingMethod = ref<"weighted_average" | "fifo">("weighted_average");
const toast = useToast();
const route = useRoute();

const form = reactive({
  supplierId: "",
  invoiceNumber: "",
  notes: "",
  receiveNow: true,
  productId: "",
  quantity: 1,
  unitCost: 0
});

const createSupplierForm = reactive({
  name: "",
  phone: "",
  address: ""
});

const lineItems = ref<Array<{ productId: string; productName: string; quantity: number; unitCost: number }>>([]);

const selectedProduct = computed(() => products.value.find((item) => item.id === form.productId));
const selectedSupplier = computed(() => suppliers.value.find((item) => item.id === form.supplierId) ?? null);
const filteredSuppliers = computed(() => {
  const keyword = supplierLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return suppliers.value;
  }
  return suppliers.value.filter((item) => (`${item.name} ${item.phone ?? ""}`).toLowerCase().includes(keyword));
});
const restockTotal = computed(() => lineItems.value.reduce((acc, item) => acc + item.quantity * item.unitCost, 0));

function normalizeSellCategories(values: string[] | null | undefined) {
  const cleaned = (values ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["pcs"];
}

function formatProductName(product: ProductDto) {
  const unitValue = Number(product.unitValue || 1);
  const unitMeasure = product.unitMeasure ?? "mL";
  const categories = normalizeSellCategories(product.sellCategories);
  return `${product.name} (${unitValue} ${unitMeasure} • ${categories.join("/")})`;
}

function toRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("id-ID");
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100, isActive: true });
  stores.value = result.items;
  const prefillStoreId = typeof route.query.storeId === "string" ? route.query.storeId : "";
  if (prefillStoreId && stores.value.some((store) => store.id === prefillStoreId)) {
    selectedStoreId.value = prefillStoreId;
  }
  if (!selectedStoreId.value && stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
  }
}

async function loadProducts() {
  if (!selectedStoreId.value) {
    products.value = [];
    return;
  }

  const result = await getProducts({ storeId: selectedStoreId.value, page: 1, pageSize: 200 });
  products.value = result.items;
  if (!form.productId && result.items.length > 0) {
    form.productId = result.items[0].id;
  }

  const prefillProductId = typeof route.query.productId === "string" ? route.query.productId : "";
  const prefillQty = Number(route.query.qty ?? 1);
  if (prefillProductId && result.items.some((item) => item.id === prefillProductId)) {
    form.productId = prefillProductId;
    form.quantity = Number.isFinite(prefillQty) && prefillQty > 0 ? Math.floor(prefillQty) : 1;
  }
}

async function loadSuppliers() {
  const result = await getSuppliers({ page: 1, pageSize: 200, isActive: true });
  suppliers.value = result.items;
}

async function loadPurchases() {
  if (!selectedStoreId.value) {
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const result = await getPurchases({
      page: page.value,
      pageSize: 10,
      storeId: selectedStoreId.value,
      startDate: startDate.value ? `${startDate.value}T00:00:00.000Z` : undefined,
      endDate: endDate.value ? `${endDate.value}T23:59:59.999Z` : undefined,
      search: search.value || undefined
    });

    purchases.value = result.items;
    pagination.value = result.pagination;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data purchase");
  } finally {
    loading.value = false;
  }
}

async function loadInventoryCostingMethod() {
  const status = await getPeriodClosingStatus();
  inventoryCostingMethod.value = status.inventoryCostingMethod ?? "weighted_average";
}

function costingMethodLabel() {
  return inventoryCostingMethod.value === "fifo" ? "FIFO" : "Weighted Average";
}

function addLineItem() {
  if (!selectedProduct.value) {
    toast.warning("Pilih produk dulu");
    return;
  }

  if (form.quantity <= 0 || form.unitCost <= 0) {
    toast.warning("Qty dan harga beli harus lebih dari 0");
    return;
  }

  const existing = lineItems.value.find((item) => item.productId === selectedProduct.value?.id);
  if (existing) {
    existing.quantity += Math.floor(form.quantity);
    existing.unitCost = Number(form.unitCost);
  } else {
    lineItems.value.push({
      productId: selectedProduct.value.id,
      productName: formatProductName(selectedProduct.value),
      quantity: Math.floor(form.quantity),
      unitCost: Number(form.unitCost)
    });
  }

  form.quantity = 1;
  form.unitCost = 0;
}

function removeLineItem(productId: string) {
  lineItems.value = lineItems.value.filter((item) => item.productId !== productId);
}

function resetPurchaseForm() {
  form.supplierId = "";
  form.invoiceNumber = "";
  form.notes = "";
  form.receiveNow = true;
  form.quantity = 1;
  form.unitCost = 0;
  lineItems.value = [];
}

function getPurchaseRemainingQty(purchase: PurchaseDto) {
  return purchase.items.reduce((acc, item) => {
    const fallbackRemaining = Math.max(Number(item.quantity ?? 0), 0);
    const remaining = Number(item.remainingQuantity ?? fallbackRemaining);
    return acc + (Number.isFinite(remaining) ? remaining : 0);
  }, 0);
}

async function receiveRemaining(purchase: PurchaseDto) {
  const remainingItems = purchase.items
    .map((item) => {
      const fallbackRemaining = Math.max(Number(item.quantity ?? 0), 0);
      const remaining = Number(item.remainingQuantity ?? fallbackRemaining);
      return {
        productId: item.productId,
        quantity: Math.floor(Number.isFinite(remaining) ? remaining : 0)
      };
    })
    .filter((item) => item.quantity > 0);

  if (remainingItems.length === 0) {
    toast.info("Purchase ini sudah diterima penuh");
    return;
  }

  receivingPurchaseId.value = purchase.id;
  try {
    await receivePurchaseItems(purchase.id, { items: remainingItems });
    toast.success("Sisa purchase berhasil diterima");
    await Promise.all([loadProducts(), loadPurchases()]);
  } catch (err) {
    const message = getErrorMessage(err, "Gagal menerima sisa purchase");
    toast.error(message);
    error.value = message;
  } finally {
    receivingPurchaseId.value = "";
  }
}

function openSupplierLov() {
  supplierLovSearch.value = "";
  createSupplierForm.name = "";
  createSupplierForm.phone = "";
  createSupplierForm.address = "";
  supplierLovOpen.value = true;
}

function closeSupplierLov() {
  supplierLovOpen.value = false;
  supplierLovSearch.value = "";
}

function selectSupplier(supplierId: string) {
  form.supplierId = supplierId;
  closeSupplierLov();
}

async function createSupplierFromLov() {
  const name = createSupplierForm.name.trim();
  if (!name) {
    toast.warning("Nama supplier wajib diisi");
    return;
  }

  creatingSupplier.value = true;
  try {
    const created = await createSupplier({
      name,
      phone: createSupplierForm.phone.trim() || undefined,
      address: createSupplierForm.address.trim() || undefined,
      isActive: true
    });
    await loadSuppliers();
    form.supplierId = created.id;
    toast.success("Supplier baru berhasil dibuat");
    closeSupplierLov();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal membuat supplier"));
  } finally {
    creatingSupplier.value = false;
  }
}

async function submitPurchase() {
  if (!selectedStoreId.value) {
    toast.warning("Pilih store dulu");
    return;
  }

  if (!form.supplierId) {
    toast.warning("Supplier wajib diisi");
    return;
  }

  if (!selectedSupplier.value) {
    toast.warning("Supplier tidak valid, pilih ulang dari LOV");
    return;
  }

  if (lineItems.value.length === 0) {
    toast.warning("Tambahkan minimal 1 item restock");
    return;
  }

  submitting.value = true;
  try {
    await createPurchase({
      storeId: selectedStoreId.value,
      supplierId: selectedSupplier.value.id,
      invoiceNumber: form.invoiceNumber.trim() || undefined,
      notes: form.notes.trim() || undefined,
      receiveNow: form.receiveNow,
      purchasedAt: new Date().toISOString(),
      items: lineItems.value.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost
      }))
    });

    resetPurchaseForm();

    toast.success("Purchase/restock berhasil disimpan");
    await Promise.all([loadProducts(), loadPurchases()]);
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menyimpan purchase/restock");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadPurchases();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadPurchases();
  }
}

watch(selectedStoreId, () => {
  page.value = 1;
  lineItems.value = [];
  void Promise.all([loadProducts(), loadPurchases(), loadSuppliers()]);
});

onMounted(async () => {
  try {
    await loadStores();
    await Promise.all([loadProducts(), loadPurchases(), loadSuppliers(), loadInventoryCostingMethod()]);
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat halaman purchase");
  }
});
</script>

<template>
  <section>
    <PageHeader title="Purchase / Restock" subtitle="Catat pembelian supplier, stok masuk, dan histori harga beli." />

    <div class="mt-4 inline-flex items-center rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      Costing: {{ costingMethodLabel() }}
    </div>

    <PageFilterBar unstyled class="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-5">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari supplier / invoice" />
      <input v-model="startDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input v-model="endDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadPurchases">Filter</button>
    </PageFilterBar>

    <PageErrorAlert :message="error" class="mt-2" />

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">Input Restock</h2>
      <div class="mt-3 grid gap-2 md:grid-cols-4">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openSupplierLov"
        >
          {{ selectedSupplier?.name || 'Pilih supplier (LOV)' }}
        </button>
        <input v-model="form.invoiceNumber" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="No invoice (opsional)" />
        <input v-model="form.notes" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Catatan (opsional)" />
      </div>

      <label class="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input v-model="form.receiveNow" type="checkbox" class="h-4 w-4 rounded border-slate-300" />
        Terima stok sekarang
      </label>

      <div class="mt-3 grid gap-2 md:grid-cols-5">
        <select v-model="form.productId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2">
          <option v-for="product in products" :key="product.id" :value="product.id">{{ formatProductName(product) }}</option>
        </select>
        <input v-model.number="form.quantity" type="number" min="1" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Qty" />
        <input v-model.number="form.unitCost" type="number" min="1" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Harga beli" />
        <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="addLineItem">Tambah Item</button>
      </div>

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Produk</th>
              <th class="px-3 py-2">Qty</th>
              <th class="px-3 py-2">Harga Beli</th>
              <th class="px-3 py-2">Subtotal</th>
              <th class="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="item in lineItems" :key="item.productId">
              <td class="px-3 py-2">{{ item.productName }}</td>
              <td class="px-3 py-2">{{ item.quantity }}</td>
              <td class="px-3 py-2">{{ toRupiah(item.unitCost) }}</td>
              <td class="px-3 py-2">{{ toRupiah(item.quantity * item.unitCost) }}</td>
              <td class="px-3 py-2">
                <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="removeLineItem(item.productId)">Hapus</button>
              </td>
            </tr>
            <tr v-if="lineItems.length === 0">
              <td colspan="5" class="px-3 py-4 text-center text-slate-500">Belum ada item restock</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex items-center justify-between">
        <p class="text-sm text-slate-600">Total Purchase: <strong>{{ toRupiah(restockTotal) }}</strong></p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="resetPurchaseForm"
          >
            Cancel
          </button>
          <LoadingButton
            :loading="submitting"
            loading-text="Menyimpan..."
            class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            @click="submitPurchase"
          >
            Simpan Purchase
          </LoadingButton>
        </div>
      </div>
    </article>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Histori Purchase</h2>
        <span class="text-xs text-slate-500">{{ loading ? "Loading..." : `${pagination.total} data` }}</span>
      </div>

      <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-left text-slate-600">
            <tr>
              <th class="px-3 py-2">Waktu</th>
              <th class="px-3 py-2">Supplier</th>
              <th class="px-3 py-2">Invoice</th>
              <th class="px-3 py-2">Jumlah Item</th>
              <th class="px-3 py-2">Sisa Terima</th>
              <th class="px-3 py-2">Total</th>
              <th class="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="purchase in purchases" :key="purchase.id">
              <td class="px-3 py-2">{{ formatDate(purchase.purchasedAt) }}</td>
              <td class="px-3 py-2">{{ purchase.supplierName }}</td>
              <td class="px-3 py-2">{{ purchase.invoiceNumber || '-' }}</td>
              <td class="px-3 py-2">{{ purchase.items.length }}</td>
              <td class="px-3 py-2">{{ getPurchaseRemainingQty(purchase) }}</td>
              <td class="px-3 py-2">{{ toRupiah(purchase.items.reduce((acc, item) => acc + Number(item.lineTotal), 0)) }}</td>
              <td class="px-3 py-2">
                <button
                  class="rounded border border-slate-300 px-2 py-1 text-xs"
                  :disabled="receivingPurchaseId === purchase.id || getPurchaseRemainingQty(purchase) <= 0"
                  @click="receiveRemaining(purchase)"
                >
                  {{ receivingPurchaseId === purchase.id ? "Memproses..." : "Terima Sisa" }}
                </button>
              </td>
            </tr>
            <tr v-if="purchases.length === 0">
              <td colspan="7" class="px-3 py-4 text-center text-slate-500">Belum ada histori purchase</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex items-center justify-end gap-2 text-sm">
        <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
        <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
        <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
      </div>
    </article>

    <div v-if="supplierLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeSupplierLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Supplier</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeSupplierLov">Tutup</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">Jika supplier belum ada, buat dulu dari form di bawah.</p>
        <input v-model="supplierLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari supplier..." />

        <div class="mt-3 max-h-[260px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Nama</th>
                <th class="px-4 py-2">Phone</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="item in filteredSuppliers" :key="item.id">
                <td class="px-4 py-2">{{ item.name }}</td>
                <td class="px-4 py-2">{{ item.phone || '-' }}</td>
                <td class="px-4 py-2">
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectSupplier(item.id)">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredSuppliers.length === 0" class="px-4 py-3 text-xs text-slate-500">Supplier tidak ditemukan.</p>
        </div>

        <div class="mt-4 rounded-lg border border-slate-200 p-3">
          <h4 class="text-sm font-semibold text-slate-900">Buat Supplier Baru</h4>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            <input v-model="createSupplierForm.name" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama supplier" />
            <input v-model="createSupplierForm.phone" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="No HP (opsional)" />
            <input v-model="createSupplierForm.address" class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Alamat (opsional)" />
          </div>
          <div class="mt-3 flex justify-end">
            <LoadingButton
              :loading="creatingSupplier"
              loading-text="Membuat..."
              class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              @click="createSupplierFromLov"
            >
              Buat & Pilih Supplier
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
