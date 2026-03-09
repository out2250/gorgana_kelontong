<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageHeader from "@/components/PageHeader.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import {
  adjustProduct,
  getBrands,
  getCategories,
  createProduct,
  getProducts,
  getStores,
  getSuppliers,
  postStockMovement,
  type BrandDto,
  type CategoryDto,
  type ProductDto,
  type SupplierDto,
  type StoreDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const UNIT_OPTIONS = ["mL", "L", "mG", "KG"] as const;
const SELL_CATEGORY_OPTIONS = ["pcs", "bungkus", "lusin", "dus", "kotak", "pack", "botol", "kaleng", "sachet"];

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const products = ref<ProductDto[]>([]);
const categories = ref<CategoryDto[]>([]);
const brands = ref<BrandDto[]>([]);
const suppliers = ref<SupplierDto[]>([]);
const error = ref("");
const submittingProduct = ref(false);
const submittingMovement = ref(false);
const submittingAdjustment = ref(false);
const sellCategoryLovOpen = ref(false);
const sellCategoryLovSearch = ref("");
const sellCategoryLovTarget = ref<"form" | "adjustment">("form");
const sellCategoryDraft = ref<string[]>([]);
const categoryLovOpen = ref(false);
const categoryLovSearch = ref("");
const categoryLovTarget = ref<"form" | "adjustment">("form");
const brandLovOpen = ref(false);
const brandLovSearch = ref("");
const brandLovTarget = ref<"form" | "adjustment">("form");
const supplierLovOpen = ref(false);
const supplierLovSearch = ref("");
const toast = useToast();
const search = ref("");
const page = ref(1);
const pagination = ref({ page: 1, pageSize: 10, total: 0, totalPages: 1 });

const form = reactive({
  name: "",
  barcode: "",
  category: "cair" as "cair" | "padat",
  categoryId: "",
  brandId: "",
  supplierId: "",
  unitMeasure: "mL" as "mL" | "L" | "mG" | "KG",
  unitValue: 1,
  sellCategories: ["pcs"] as string[],
  sellPrice: 0,
  minimumStock: 0,
  stockOnHand: 0
});

const stockForm = reactive({
  productId: "",
  type: "in" as "in" | "out" | "adjustment",
  quantity: 1,
  reason: ""
});

const adjustmentForm = reactive({
  productId: "",
  barcode: "",
  category: "cair" as "cair" | "padat",
  categoryId: "",
  brandId: "",
  unitMeasure: "mL" as "mL" | "L" | "mG" | "KG",
  unitValue: 1,
  sellCategories: ["pcs"] as string[],
  sellPrice: 0,
  minimumStock: 0,
  stockOnHand: 0
});

function normalizeSellCategories(values: string[] | null | undefined) {
  const cleaned = (values ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["pcs"];
}

const filteredSellCategoryOptions = computed(() => {
  const keyword = sellCategoryLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return SELL_CATEGORY_OPTIONS;
  }
  return SELL_CATEGORY_OPTIONS.filter((option) => option.toLowerCase().includes(keyword));
});

const filteredCategories = computed(() => {
  const keyword = categoryLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return categories.value;
  }
  return categories.value.filter((item) => item.name.toLowerCase().includes(keyword));
});

const filteredBrands = computed(() => {
  const keyword = brandLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return brands.value;
  }
  return brands.value.filter((item) => item.name.toLowerCase().includes(keyword));
});

const filteredSuppliers = computed(() => {
  const keyword = supplierLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return suppliers.value;
  }
  return suppliers.value.filter((item) => (`${item.name} ${item.phone ?? ""}`).toLowerCase().includes(keyword));
});

function openSellCategoryLov(target: "form" | "adjustment") {
  sellCategoryLovTarget.value = target;
  sellCategoryLovSearch.value = "";
  sellCategoryDraft.value = normalizeSellCategories(target === "form" ? form.sellCategories : adjustmentForm.sellCategories);
  sellCategoryLovOpen.value = true;
}

function closeSellCategoryLov() {
  sellCategoryLovOpen.value = false;
  sellCategoryLovSearch.value = "";
}

function toggleSellCategoryDraft(category: string) {
  if (sellCategoryDraft.value.includes(category)) {
    sellCategoryDraft.value = sellCategoryDraft.value.filter((item) => item !== category);
    return;
  }
  sellCategoryDraft.value = [...sellCategoryDraft.value, category];
}

function isSellCategorySelected(category: string) {
  return sellCategoryDraft.value.includes(category);
}

function applySellCategoryLov() {
  const normalized = normalizeSellCategories(sellCategoryDraft.value);
  if (sellCategoryLovTarget.value === "form") {
    form.sellCategories = normalized;
  } else {
    adjustmentForm.sellCategories = normalized;
  }
  closeSellCategoryLov();
}

function formatSellCategoriesLabel(values: string[]) {
  return normalizeSellCategories(values).join(" / ");
}

function getCategoryName(id?: string | null) {
  if (!id) {
    return "Pilih kategori (LOV)";
  }
  return categories.value.find((item) => item.id === id)?.name ?? "Pilih kategori (LOV)";
}

function getBrandName(id?: string | null) {
  if (!id) {
    return "Pilih brand (LOV)";
  }
  return brands.value.find((item) => item.id === id)?.name ?? "Pilih brand (LOV)";
}

function getSupplierName(id?: string | null) {
  if (!id) {
    return "Pilih supplier (LOV)";
  }
  return suppliers.value.find((item) => item.id === id)?.name ?? "Pilih supplier (LOV)";
}

function openCategoryLov(target: "form" | "adjustment") {
  categoryLovTarget.value = target;
  categoryLovSearch.value = "";
  categoryLovOpen.value = true;
}

function closeCategoryLov() {
  categoryLovOpen.value = false;
  categoryLovSearch.value = "";
}

function selectCategory(categoryId: string) {
  if (categoryLovTarget.value === "form") {
    form.categoryId = categoryId;
  } else {
    adjustmentForm.categoryId = categoryId;
  }
  closeCategoryLov();
}

function openBrandLov(target: "form" | "adjustment") {
  brandLovTarget.value = target;
  brandLovSearch.value = "";
  brandLovOpen.value = true;
}

function closeBrandLov() {
  brandLovOpen.value = false;
  brandLovSearch.value = "";
}

function selectBrand(brandId: string) {
  if (brandLovTarget.value === "form") {
    form.brandId = brandId;
  } else {
    adjustmentForm.brandId = brandId;
  }
  closeBrandLov();
}

function openSupplierLov() {
  supplierLovSearch.value = "";
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

function formatProductName(product: ProductDto) {
  const unitValue = Number(product.unitValue || 1);
  const unitMeasure = product.unitMeasure ?? "mL";
  const categories = normalizeSellCategories(product.sellCategories);
  return `${product.name} (${unitValue} ${unitMeasure} • ${categories.join("/")})`;
}

function resetProductForm() {
  form.name = "";
  form.barcode = "";
  form.category = "cair";
  form.categoryId = "";
  form.brandId = "";
  form.supplierId = "";
  form.unitMeasure = "mL";
  form.unitValue = 1;
  form.sellCategories = ["pcs"];
  form.sellPrice = 0;
  form.minimumStock = 0;
  form.stockOnHand = 0;
}

function resetStockMovementForm() {
  stockForm.type = "in";
  stockForm.quantity = 1;
  stockForm.reason = "";
}

function resetAdjustmentForm() {
  adjustmentForm.barcode = "";
  adjustmentForm.category = "cair";
  adjustmentForm.categoryId = "";
  adjustmentForm.brandId = "";
  adjustmentForm.unitMeasure = "mL";
  adjustmentForm.unitValue = 1;
  adjustmentForm.sellCategories = ["pcs"];
  adjustmentForm.sellPrice = 0;
  adjustmentForm.minimumStock = 0;
  adjustmentForm.stockOnHand = 0;
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100 });
  stores.value = result.items;
  if (!selectedStoreId.value && result.items.length > 0) {
    selectedStoreId.value = result.items[0].id;
  }
}

async function loadCatalogMasters() {
  const [categoryResult, brandResult, supplierResult] = await Promise.all([
    getCategories({ page: 1, pageSize: 200, isActive: true }),
    getBrands({ page: 1, pageSize: 200, isActive: true }),
    getSuppliers({ page: 1, pageSize: 200, isActive: true })
  ]);

  categories.value = categoryResult.items;
  brands.value = brandResult.items;
  suppliers.value = supplierResult.items;
}

watch(page, (newPage) => {
  if (newPage < 1) {
    page.value = 1;
  } else if (newPage > pagination.value.totalPages) {
    page.value = pagination.value.totalPages;
  }
});

async function loadProducts() {
  if (!selectedStoreId.value) return;
  const result = await getProducts({
    storeId: selectedStoreId.value,
    page: page.value,
    pageSize: 10,
    search: search.value || undefined
  });
  products.value = result.items;
  pagination.value = result.pagination;
  if (!stockForm.productId && result.items.length > 0) {
    stockForm.productId = result.items[0].id;
  }
  if (!adjustmentForm.productId && result.items.length > 0) {
    adjustmentForm.productId = result.items[0].id;
  }
  syncAdjustmentByProduct();
}

async function submitProduct() {
  if (!selectedStoreId.value) return;

  if (!form.name.trim()) {
    error.value = "Nama produk wajib diisi";
    toast.error(error.value);
    return;
  }

  const duplicateName = products.value.some((item) => item.name.toLowerCase() === form.name.trim().toLowerCase());
  if (duplicateName) {
    error.value = "Nama produk sudah ada di store ini";
    toast.error(error.value);
    return;
  }

  submittingProduct.value = true;
  try {
    await createProduct({
      storeId: selectedStoreId.value,
      name: form.name.trim(),
      barcode: form.barcode.trim() || undefined,
      category: form.category,
      categoryId: form.categoryId || undefined,
      brandId: form.brandId || undefined,
      supplierId: form.supplierId || undefined,
      unitMeasure: form.unitMeasure,
      unitValue: Number(form.unitValue),
      sellCategories: normalizeSellCategories(form.sellCategories),
      sellPrice: form.sellPrice,
      minimumStock: form.minimumStock,
      stockOnHand: form.stockOnHand
    });

    resetProductForm();

    toast.success("Produk berhasil ditambahkan");
    await loadProducts();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menambah produk");
    toast.error(error.value);
  } finally {
    submittingProduct.value = false;
  }
}

function syncAdjustmentByProduct() {
  const product = products.value.find((item) => item.id === adjustmentForm.productId);
  if (!product) {
    return;
  }

  adjustmentForm.category = (product.category ?? "cair") as "cair" | "padat";
  adjustmentForm.barcode = product.barcode ?? "";
  adjustmentForm.categoryId = product.categoryId ?? "";
  adjustmentForm.brandId = product.brandId ?? "";
  adjustmentForm.unitMeasure = (product.unitMeasure ?? "mL") as "mL" | "L" | "mG" | "KG";
  adjustmentForm.unitValue = Number(product.unitValue || 1);
  adjustmentForm.sellCategories = normalizeSellCategories(product.sellCategories);
  adjustmentForm.sellPrice = Number(product.sellPrice);
  adjustmentForm.minimumStock = product.minimumStock;
  adjustmentForm.stockOnHand = product.stockOnHand;
}

async function submitAdjustment() {
  if (!adjustmentForm.productId) {
    error.value = "Pilih produk untuk adjustment";
    toast.error(error.value);
    return;
  }

  submittingAdjustment.value = true;
  try {
    await adjustProduct(adjustmentForm.productId, {
      barcode: adjustmentForm.barcode.trim() || undefined,
      category: adjustmentForm.category,
      categoryId: adjustmentForm.categoryId || undefined,
      brandId: adjustmentForm.brandId || undefined,
      unitMeasure: adjustmentForm.unitMeasure,
      unitValue: Number(adjustmentForm.unitValue),
      sellCategories: normalizeSellCategories(adjustmentForm.sellCategories),
      sellPrice: Number(adjustmentForm.sellPrice),
      minimumStock: Number(adjustmentForm.minimumStock),
      stockOnHand: Number(adjustmentForm.stockOnHand)
    });
    toast.success("Adjustment harga, minimum stok, dan stok berhasil disimpan");
    await loadProducts();
    syncAdjustmentByProduct();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal adjustment produk");
    toast.error(error.value);
  } finally {
    submittingAdjustment.value = false;
  }
}

async function submitStockMovement() {
  if (!selectedStoreId.value || !stockForm.productId || stockForm.quantity <= 0) {
    return;
  }

  submittingMovement.value = true;
  try {
    await postStockMovement({
      storeId: selectedStoreId.value,
      productId: stockForm.productId,
      type: stockForm.type,
      quantity: Number(stockForm.quantity),
      reason: stockForm.reason || undefined
    });

    stockForm.quantity = 1;
    stockForm.reason = "";
    toast.success("Stock movement berhasil disimpan");
    await loadProducts();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal menyimpan stock movement");
    toast.error(error.value);
  } finally {
    submittingMovement.value = false;
  }
}

async function exportInventoryCsv() {
  if (!selectedStoreId.value) {
    toast.warning("Pilih store dulu");
    return;
  }

  try {
    const result = await getProducts({
      storeId: selectedStoreId.value,
      page: 1,
      pageSize: 500,
      search: search.value || undefined
    });

    if (result.items.length === 0) {
      toast.warning("Tidak ada data inventory untuk diexport");
      return;
    }

    const headers = ["SKU", "Nama", "Kategori", "Satuan", "Kategori Jual", "Stok", "Min Stok", "Harga Jual"];
    const rows = result.items.map((item) => [
      item.sku,
      item.name,
      item.category ?? "",
      `${Number(item.unitValue || 1)} ${item.unitMeasure ?? "mL"}`,
      normalizeSellCategories(item.sellCategories).join("/"),
      item.stockOnHand,
      item.minimumStock,
      Number(item.sellPrice)
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV inventory berhasil diunduh");
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal export CSV inventory"));
  }
}

watch(selectedStoreId, () => {
  page.value = 1;
  stockForm.productId = "";
  adjustmentForm.productId = "";
  void loadProducts();
});


onMounted(async () => {
  try {
    await Promise.all([loadStores(), loadCatalogMasters()]);
    await loadProducts();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat inventory");
  }
});

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function nextPage() {
  if (pagination.value.page < pagination.value.totalPages) {
    page.value += 1;
    void loadProducts();
  }
}

function prevPage() {
  if (pagination.value.page > 1) {
    page.value -= 1;
    void loadProducts();
  }
}
</script>

<template>
  <section>
    <PageHeader title="Inventory Management" subtitle="Pantau stok per store dan alert minimum stok.">
      <template #right>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="exportInventoryCsv"
        >
          Export CSV
        </button>
      </template>
    </PageHeader>

    <div class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
      <div>
        <label class="mb-1 block text-xs text-slate-500">Store</label>
        <select v-model="selectedStoreId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">SKU</label>
        <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          SKU dibuat otomatis saat simpan (format: SKU-XXXXXX-000001)
        </p>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Nama Produk</label>
        <input
          v-model="form.name"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
          placeholder="Contoh: MINYAK GORENG"
          @input="form.name = form.name.toUpperCase()"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Barcode</label>
        <input
          v-model="form.barcode"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Opsional"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori Produk</label>
        <select v-model="form.category" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="cair">cair</option>
          <option value="padat">padat</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori Master</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openCategoryLov('form')"
        >
          {{ getCategoryName(form.categoryId) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Brand</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openBrandLov('form')"
        >
          {{ getBrandName(form.brandId) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Supplier</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openSupplierLov"
        >
          {{ getSupplierName(form.supplierId) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Ukuran Satuan</label>
        <input v-model.number="form.unitValue" type="number" min="0.01" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Contoh: 1" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Unit</label>
        <select v-model="form.unitMeasure" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option v-for="unit in UNIT_OPTIONS" :key="unit" :value="unit">{{ unit }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori Jual</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openSellCategoryLov('form')"
        >
          {{ formatSellCategoriesLabel(form.sellCategories) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Harga Jual</label>
        <input v-model.number="form.sellPrice" type="number" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Harga" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Minimum Stok</label>
        <input v-model.number="form.minimumStock" type="number" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Min stok" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Stok Awal</label>
        <input v-model.number="form.stockOnHand" type="number" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Stok awal" />
      </div>
      <div class="flex items-end justify-end gap-2 md:col-span-4">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="resetProductForm"
        >
          Cancel
        </button>
        <LoadingButton
          :loading="submittingProduct"
          loading-text="Menyimpan..."
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          @click="submitProduct"
        >
          Simpan Produk
        </LoadingButton>
      </div>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari SKU / nama produk" />
      <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadProducts">Filter</button>
    </div>

    <div class="mt-3 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4">
      <select v-model="stockForm.productId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="item in products" :key="item.id" :value="item.id">{{ item.sku }} - {{ formatProductName(item) }}</option>
      </select>
      <select v-model="stockForm.type" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="in">Stock In</option>
        <option value="out">Stock Out</option>
        <option value="adjustment">Adjustment</option>
      </select>
      <input v-model.number="stockForm.quantity" type="number" min="1" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Qty" />
      <input v-model="stockForm.reason" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Reason" />
      <div class="flex items-end justify-end gap-2 md:col-span-4">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="resetStockMovementForm"
        >
          Cancel
        </button>
        <LoadingButton
          :loading="submittingMovement"
          loading-text="Menyimpan..."
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          @click="submitStockMovement"
        >
          Simpan Stock Movement
        </LoadingButton>
      </div>
    </div>

    <div class="mt-3 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-5">
      <div>
        <label class="mb-1 block text-xs text-slate-500">Produk (Adjustment)</label>
        <select v-model="adjustmentForm.productId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" @change="syncAdjustmentByProduct">
          <option v-for="item in products" :key="item.id" :value="item.id">{{ item.sku }} - {{ formatProductName(item) }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori</label>
        <select v-model="adjustmentForm.category" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="cair">cair</option>
          <option value="padat">padat</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Barcode</label>
        <input v-model="adjustmentForm.barcode" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Opsional" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori Master</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openCategoryLov('adjustment')"
        >
          {{ getCategoryName(adjustmentForm.categoryId) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Brand</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openBrandLov('adjustment')"
        >
          {{ getBrandName(adjustmentForm.brandId) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Ukuran Satuan</label>
        <input v-model.number="adjustmentForm.unitValue" type="number" min="0.01" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Unit</label>
        <select v-model="adjustmentForm.unitMeasure" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option v-for="unit in UNIT_OPTIONS" :key="unit" :value="unit">{{ unit }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Kategori Jual</label>
        <button
          type="button"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          @click="openSellCategoryLov('adjustment')"
        >
          {{ formatSellCategoriesLabel(adjustmentForm.sellCategories) }}
        </button>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Harga Jual</label>
        <input v-model.number="adjustmentForm.sellPrice" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Minimum Stok</label>
        <input v-model.number="adjustmentForm.minimumStock" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Stok On Hand</label>
        <input v-model.number="adjustmentForm.stockOnHand" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div class="flex items-end justify-end gap-2 md:col-span-5">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="resetAdjustmentForm"
        >
          Cancel
        </button>
        <LoadingButton
          :loading="submittingAdjustment"
          loading-text="Menyimpan..."
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          @click="submitAdjustment"
        >
          Simpan Adjustment
        </LoadingButton>
      </div>
    </div>

    <PageErrorAlert :message="error" class="mt-2" />

    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">SKU</th>
            <th class="px-4 py-3">Produk</th>
            <th class="px-4 py-3">Satuan</th>
            <th class="px-4 py-3">Kategori Jual</th>
            <th class="px-4 py-3">Stok Saat Ini</th>
            <th class="px-4 py-3">Minimum Stok</th>
            <th class="px-4 py-3">Harga Jual (IDR)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in products" :key="item.id">
            <td class="px-4 py-3 text-slate-700">{{ item.sku }}</td>
            <td class="px-4 py-3 text-slate-900">{{ formatProductName(item) }}</td>
            <td class="px-4 py-3 text-slate-600">{{ Number(item.unitValue || 1) }} {{ item.unitMeasure || "mL" }}</td>
            <td class="px-4 py-3 text-slate-600">{{ normalizeSellCategories(item.sellCategories).join("/") }}</td>
            <td class="px-4 py-3">
              <span
                class="rounded px-2 py-1 text-xs"
                :class="item.stockOnHand < item.minimumStock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'"
              >
                {{ item.stockOnHand }}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ item.minimumStock }}</td>
            <td class="px-4 py-3 text-slate-600">{{ formatCurrency(Number(item.sellPrice)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2 text-sm">
      <button class="rounded border border-slate-300 px-3 py-1" @click="prevPage">Prev</button>
      <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button class="rounded border border-slate-300 px-3 py-1" @click="nextPage">Next</button>
    </div>

    <div v-if="sellCategoryLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeSellCategoryLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Kategori Jual</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeSellCategoryLov">Tutup</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">Pilih satu atau lebih kategori.</p>
        <input
          v-model="sellCategoryLovSearch"
          class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Cari kategori..."
        />

        <div class="mt-3 max-h-[320px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Kategori</th>
                <th class="px-4 py-2">Status</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr
                v-for="sellCategory in filteredSellCategoryOptions"
                :key="sellCategory"
                :class="isSellCategorySelected(sellCategory) ? 'bg-slate-50' : ''"
              >
                <td class="px-4 py-2 text-slate-700">{{ sellCategory }}</td>
                <td class="px-4 py-2 text-xs">
                  <span
                    class="rounded px-2 py-1"
                    :class="isSellCategorySelected(sellCategory) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                  >
                    {{ isSellCategorySelected(sellCategory) ? 'Dipilih' : 'Belum' }}
                  </span>
                </td>
                <td class="px-4 py-2">
                  <button
                    type="button"
                    class="rounded border border-slate-300 px-2 py-1 text-xs"
                    @click="toggleSellCategoryDraft(sellCategory)"
                  >
                    {{ isSellCategorySelected(sellCategory) ? 'Hapus' : 'Pilih' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredSellCategoryOptions.length === 0" class="px-4 py-3 text-xs text-slate-500">Kategori tidak ditemukan.</p>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="closeSellCategoryLov"
          >
            Batal
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            @click="applySellCategoryLov"
          >
            Pakai Kategori
          </button>
        </div>
      </div>
    </div>

    <div v-if="categoryLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeCategoryLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Kategori Master</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeCategoryLov">Tutup</button>
        </div>
        <input v-model="categoryLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari kategori..." />
        <div class="mt-3 max-h-[320px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Nama</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="item in filteredCategories" :key="item.id">
                <td class="px-4 py-2">{{ item.name }}</td>
                <td class="px-4 py-2">
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectCategory(item.id)">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredCategories.length === 0" class="px-4 py-3 text-xs text-slate-500">Kategori tidak ditemukan.</p>
        </div>
      </div>
    </div>

    <div v-if="brandLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeBrandLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Brand</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeBrandLov">Tutup</button>
        </div>
        <input v-model="brandLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari brand..." />
        <div class="mt-3 max-h-[320px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Nama</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="item in filteredBrands" :key="item.id">
                <td class="px-4 py-2">{{ item.name }}</td>
                <td class="px-4 py-2">
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectBrand(item.id)">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredBrands.length === 0" class="px-4 py-3 text-xs text-slate-500">Brand tidak ditemukan.</p>
        </div>
      </div>
    </div>

    <div v-if="supplierLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeSupplierLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Supplier</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeSupplierLov">Tutup</button>
        </div>
        <input v-model="supplierLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari supplier..." />
        <div class="mt-3 max-h-[320px] overflow-auto rounded border border-slate-200">
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
      </div>
    </div>
  </section>
</template>
