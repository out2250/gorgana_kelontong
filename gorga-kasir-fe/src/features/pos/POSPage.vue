<script setup lang="ts">
import axios from "axios";
import { computed, onMounted, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  createProduct,
  getBrands,
  getCategories,
  getPeriodClosingStatus,
  getProducts,
  getPromos,
  getSaleDetail,
  getSales,
  getStores,
  getSuppliers,
  postSale,
  type BrandDto,
  type CategoryDto,
  type ProductDto,
  type PromoDto,
  type SaleDetailDto,
  type SaleDto,
  type StoreDto,
  type SupplierDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { enqueue } from "@/services/offlineQueue";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/services/toast";

const UNIT_OPTIONS = ["mL", "L", "mG", "KG"] as const;
const SELL_CATEGORY_OPTIONS = ["pcs", "bungkus", "lusin", "dus", "kotak", "pack", "botol", "kaleng", "sachet"];

type CartItem = {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  stockOnHand: number;
  unitPrice: number;
  quantity: number;
  discount: number;
};

const stores = ref<StoreDto[]>([]);
const selectedStoreId = ref("");
const products = ref<ProductDto[]>([]);
const categories = ref<CategoryDto[]>([]);
const brands = ref<BrandDto[]>([]);
const suppliers = ref<SupplierDto[]>([]);
const selectedProductId = ref("");
const quantity = ref(1);
const paymentMethod = ref("cash");
const paidAmount = ref(0);
const referenceNumber = ref("");
const splitPayment = reactive({
  cash: 0,
  qris: 0,
  transfer: 0
});
const promoCode = ref("");
const discount = ref(0);
const cart = ref<CartItem[]>([]);
const promoItems = ref<PromoDto[]>([]);
const salesHistory = ref<SaleDto[]>([]);
const salesHistoryPage = ref(1);
const salesHistoryPagination = ref({ page: 1, pageSize: 5, total: 0, totalPages: 1 });
const loading = ref(false);
const creatingProduct = ref(false);
const salesHistoryLoading = ref(false);
const saleDetailOpen = ref(false);
const saleDetailLoading = ref(false);
const selectedSaleDetail = ref<SaleDetailDto | null>(null);
const checkoutConfirmOpen = ref(false);
const status = ref("");
const productLovOpen = ref(false);
const promoLovOpen = ref(false);
const sellCategoryLovOpen = ref(false);
const categoryLovOpen = ref(false);
const brandLovOpen = ref(false);
const supplierLovOpen = ref(false);
const productLovSearch = ref("");
const promoLovSearch = ref("");
const sellCategoryLovSearch = ref("");
const categoryLovSearch = ref("");
const brandLovSearch = ref("");
const supplierLovSearch = ref("");
const sellCategoryDraft = ref<string[]>([]);
const inventoryCostingMethod = ref<"weighted_average" | "fifo">("weighted_average");
const toast = useToast();
const auth = useAuthStore();
const lastReceipt = ref<{
  saleId?: string;
  createdAt: string;
  storeName: string;
  cashierName: string;
  paymentMethod: string;
  total: number;
  paidAmount?: number;
  changeAmount?: number;
  items: Array<{ name: string; qty: number; unitPrice: number; subtotal: number }>;
} | null>(null);

const quickProduct = reactive({
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

function resetQuickProductForm() {
  quickProduct.name = "";
  quickProduct.barcode = "";
  quickProduct.category = "cair";
  quickProduct.categoryId = "";
  quickProduct.brandId = "";
  quickProduct.supplierId = "";
  quickProduct.unitMeasure = "mL";
  quickProduct.unitValue = 1;
  quickProduct.sellCategories = ["pcs"];
  quickProduct.sellPrice = 0;
  quickProduct.minimumStock = 0;
  quickProduct.stockOnHand = 0;
}

const filter = reactive({
  search: ""
});

const filteredProducts = computed(() => {
  const keyword = productLovSearch.value.trim().toLowerCase() || filter.search.trim().toLowerCase();
  if (!keyword) {
    return products.value;
  }

  return products.value.filter((item) => {
    return item.name.toLowerCase().includes(keyword) || item.sku.toLowerCase().includes(keyword);
  });
});

const filteredPromos = computed(() => {
  const keyword = promoLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return promoItems.value;
  }

  return promoItems.value.filter((promo) => {
    return (`${promo.code} ${promo.name} ${promo.description ?? ""}`).toLowerCase().includes(keyword);
  });
});

const filteredSellCategoryOptions = computed(() => {
  const keyword = sellCategoryLovSearch.value.trim().toLowerCase();
  if (!keyword) {
    return SELL_CATEGORY_OPTIONS;
  }

  return SELL_CATEGORY_OPTIONS.filter((category) => category.toLowerCase().includes(keyword));
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

const subtotal = computed(() => {
  return cart.value.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
});

const itemDiscountTotal = computed(() => {
  return cart.value.reduce((acc, item) => {
    const lineRaw = item.quantity * item.unitPrice;
    return acc + Math.min(item.discount || 0, lineRaw);
  }, 0);
});

const subtotalAfterItemDiscount = computed(() => {
  return Math.max(subtotal.value - itemDiscountTotal.value, 0);
});

function isPromoActiveNow(promo: PromoDto) {
  const now = Date.now();
  const startAt = new Date(promo.startAt).getTime();
  const endAt = new Date(promo.endAt).getTime();
  return promo.isActive && now >= startAt && now <= endAt;
}

const selectedPromo = computed(() => {
  const code = promoCode.value.trim().toUpperCase();
  if (!code || !selectedStoreId.value) {
    return null;
  }

  return promoItems.value.find((promo) => promo.code.toUpperCase() === code) ?? null;
});

const promoDiscountPreview = computed(() => {
  if (!selectedPromo.value || !isPromoActiveNow(selectedPromo.value)) {
    return 0;
  }

  const eligibleSubtotal = selectedPromo.value.category
    ? cart.value
        .filter((item) => item.category === selectedPromo.value?.category)
        .reduce((acc, item) => acc + Math.max(item.quantity * item.unitPrice - item.discount, 0), 0)
    : subtotalAfterItemDiscount.value;

  return Math.floor((eligibleSubtotal * selectedPromo.value.discountPercent) / 100);
});

const grandTotal = computed(() => {
  return Math.max(subtotalAfterItemDiscount.value - discount.value - promoDiscountPreview.value, 0);
});

const isSplitPayment = computed(() => paymentMethod.value === "split");
const requiresReference = computed(() => ["qris", "transfer", "split"].includes(paymentMethod.value));
const isCashPayment = computed(() => paymentMethod.value === "cash");
const cashChangePreview = computed(() => {
  if (!isCashPayment.value) {
    return 0;
  }

  return Math.max(Number(paidAmount.value || 0) - grandTotal.value, 0);
});

const canQuickAddProduct = computed(() => {
  const role = auth.user?.role;
  return Boolean(auth.user?.isSuperAdmin || role === "owner" || role === "manager");
});

const canAddToCart = computed(() => {
  return Boolean(selectedProduct.value) && Number(quantity.value) >= 1;
});

const selectedProduct = computed(() => {
  return products.value.find((item) => item.id === selectedProductId.value);
});

function getCheckoutValidationIssues() {
  const issues: string[] = [];

  if (!selectedStoreId.value) {
    issues.push("Store belum dipilih");
  }

  if (cart.value.length === 0) {
    issues.push("Keranjang masih kosong");
  }

  if (paymentMethod.value === "split") {
    const totalSplit = Number(splitPayment.cash || 0) + Number(splitPayment.qris || 0) + Number(splitPayment.transfer || 0);

    if (splitPayment.cash <= 0) {
      issues.push("Split Cash belum diisi");
    }

    if (splitPayment.qris <= 0) {
      issues.push("Split QRIS belum diisi");
    }

    if (totalSplit < grandTotal.value) {
      issues.push("Nominal split kurang dari total");
    }

    if (!referenceNumber.value.trim()) {
      issues.push("No Referensi belum diisi");
    }
  }

  if (paymentMethod.value === "cash" && paidAmount.value < grandTotal.value) {
    issues.push("Nominal Bayar kurang dari total");
  }

  if ((paymentMethod.value === "qris" || paymentMethod.value === "transfer") && paidAmount.value > 0 && paidAmount.value < grandTotal.value) {
    issues.push("Nominal Bayar kurang dari total");
  }

  if ((paymentMethod.value === "qris" || paymentMethod.value === "transfer") && !referenceNumber.value.trim()) {
    issues.push("No Referensi belum diisi");
  }

  return issues;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function printLastReceipt() {
  if (!lastReceipt.value) {
    toast.warning("Belum ada transaksi untuk dicetak");
    return;
  }

  const receipt = lastReceipt.value;
  const content = `
    <html>
      <head>
        <title>Struk ${receipt.saleId ?? "POS"}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 8px; font-size: 11px; width: 58mm; max-width: 58mm; overflow-wrap: anywhere; }
          h2 { margin: 0 0 6px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #999; }
          .right { text-align: right; }
          .meta { margin-top: 6px; color: #333; }
          .total { margin-top: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>${receipt.storeName}</h2>
        <div class="meta">${new Date(receipt.createdAt).toLocaleString("id-ID")}</div>
        <div class="meta">Kasir: ${receipt.cashierName}</div>
        <div class="meta">Metode: ${receipt.paymentMethod}</div>
        <div class="meta">Ref: ${receipt.saleId ?? "-"}</div>
        <table>
          <thead>
            <tr><th>Item</th><th class="right">Qty</th><th class="right">Subtotal</th></tr>
          </thead>
          <tbody>
            ${receipt.items.map((item) => `<tr><td>${item.name}</td><td class="right">${item.qty}</td><td class="right">${formatCurrency(item.subtotal)}</td></tr>`).join("")}
          </tbody>
        </table>
        <div class="total">Total: ${formatCurrency(receipt.total)}</div>
        <div class="meta">Bayar: ${formatCurrency(Number(receipt.paidAmount ?? receipt.total))}</div>
        <div class="meta">Kembalian: ${formatCurrency(Number(receipt.changeAmount ?? 0))}</div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=420,height=640");
  if (!printWindow) {
    toast.error("Popup print diblokir browser");
    return;
  }

  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function loadStores() {
  const result = await getStores({ page: 1, pageSize: 100, isActive: true });
  stores.value = result.items;

  if (!selectedStoreId.value && stores.value.length > 0) {
    selectedStoreId.value = stores.value[0].id;
  }
}

async function loadProducts() {
  if (!selectedStoreId.value) {
    products.value = [];
    return;
  }

  const result = await getProducts({
    storeId: selectedStoreId.value,
    page: 1,
    pageSize: 100
  });

  products.value = result.items;
  if (!selectedProductId.value && products.value.length > 0) {
    selectedProductId.value = products.value[0].id;
  }
}

async function loadPromos() {
  const result = await getPromos({
    onlyActive: true,
    at: new Date().toISOString()
  });

  promoItems.value = result.items;
}

async function loadSalesHistory() {
  if (!selectedStoreId.value) {
    salesHistory.value = [];
    salesHistoryPagination.value = { page: 1, pageSize: 5, total: 0, totalPages: 1 };
    return;
  }

  salesHistoryLoading.value = true;
  try {
    const result = await getSales({
      storeId: selectedStoreId.value,
      page: salesHistoryPage.value,
      pageSize: 5
    });
    salesHistory.value = result.items;
    salesHistoryPagination.value = result.pagination;
  } catch (error) {
    status.value = getErrorMessage(error, "Gagal memuat history transaksi");
    toast.error(status.value);
  } finally {
    salesHistoryLoading.value = false;
  }
}

async function openSaleDetail(saleId: string) {
  saleDetailOpen.value = true;
  saleDetailLoading.value = true;
  selectedSaleDetail.value = null;

  try {
    const detail = await getSaleDetail(saleId);
    selectedSaleDetail.value = detail;
  } catch (error) {
    status.value = getErrorMessage(error, "Gagal memuat detail transaksi");
    toast.error(status.value);
    saleDetailOpen.value = false;
  } finally {
    saleDetailLoading.value = false;
  }
}

function closeSaleDetail() {
  saleDetailOpen.value = false;
  selectedSaleDetail.value = null;
}

function getPaidAmount(sale: SaleDto | SaleDetailDto) {
  return Number(sale.paidAmount ?? 0);
}

function getRemainingAmount(sale: SaleDto | SaleDetailDto) {
  const total = Number(sale.total ?? 0);
  const paid = getPaidAmount(sale);
  return Math.max(total - paid, 0);
}

function getChangeAmount(sale: SaleDto | SaleDetailDto) {
  return Number(sale.changeAmount ?? 0);
}

function checkoutPaidPreview() {
  if (paymentMethod.value === "split") {
    return Number(splitPayment.cash || 0) + Number(splitPayment.qris || 0) + Number(splitPayment.transfer || 0);
  }

  return Number(paidAmount.value || 0);
}

function checkoutRemainingPreview() {
  return Math.max(grandTotal.value - checkoutPaidPreview(), 0);
}

function nextSalesHistoryPage() {
  if (salesHistoryPagination.value.page < salesHistoryPagination.value.totalPages) {
    salesHistoryPage.value += 1;
    void loadSalesHistory();
  }
}

function prevSalesHistoryPage() {
  if (salesHistoryPagination.value.page > 1) {
    salesHistoryPage.value -= 1;
    void loadSalesHistory();
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

async function loadInventoryCostingMethod() {
  const status = await getPeriodClosingStatus();
  inventoryCostingMethod.value = status.inventoryCostingMethod ?? "weighted_average";
}

function costingMethodLabel() {
  return inventoryCostingMethod.value === "fifo" ? "FIFO" : "Weighted Average";
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

function selectProductFromLov(productId: string) {
  selectedProductId.value = productId;
  productLovOpen.value = false;
  productLovSearch.value = "";
}

function selectPromoFromLov(code: string) {
  promoCode.value = code;
  promoLovOpen.value = false;
  promoLovSearch.value = "";
}

function openSellCategoryLov() {
  sellCategoryDraft.value = normalizeSellCategories(quickProduct.sellCategories);
  sellCategoryLovSearch.value = "";
  sellCategoryLovOpen.value = true;
}

function closeSellCategoryLov() {
  sellCategoryLovOpen.value = false;
  sellCategoryLovSearch.value = "";
}

function openCategoryLov() {
  categoryLovSearch.value = "";
  categoryLovOpen.value = true;
}

function closeCategoryLov() {
  categoryLovOpen.value = false;
  categoryLovSearch.value = "";
}

function selectCategoryFromLov(categoryId: string) {
  quickProduct.categoryId = categoryId;
  closeCategoryLov();
}

function openBrandLov() {
  brandLovSearch.value = "";
  brandLovOpen.value = true;
}

function closeBrandLov() {
  brandLovOpen.value = false;
  brandLovSearch.value = "";
}

function selectBrandFromLov(brandId: string) {
  quickProduct.brandId = brandId;
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

function selectSupplierFromLov(supplierId: string) {
  quickProduct.supplierId = supplierId;
  closeSupplierLov();
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
  quickProduct.sellCategories = normalizeSellCategories(sellCategoryDraft.value);
  closeSellCategoryLov();
}

function formatSellCategoriesLabel(values: string[]) {
  return normalizeSellCategories(values).join(" / ");
}

function addToCart() {
  if (!selectedProduct.value) {
    status.value = "Pilih produk dulu";
    toast.error(status.value);
    return;
  }

  if (quantity.value < 1) {
    status.value = "Quantity minimal 1";
    toast.error(status.value);
    return;
  }

  const existing = cart.value.find((item) => item.productId === selectedProduct.value?.id);
  if (existing) {
    const nextQuantity = existing.quantity + quantity.value;
    if (nextQuantity > existing.stockOnHand) {
      existing.quantity = existing.stockOnHand;
      status.value = `Qty ${existing.name} dibatasi stok (${existing.stockOnHand})`;
      toast.warning(status.value);
    } else {
      existing.quantity = nextQuantity;
    }
  } else {
    cart.value.push({
      productId: selectedProduct.value.id,
      sku: selectedProduct.value.sku,
      name: formatProductName(selectedProduct.value),
      category: selectedProduct.value.category,
      stockOnHand: selectedProduct.value.stockOnHand,
      unitPrice: Number(selectedProduct.value.sellPrice),
      quantity: quantity.value,
      discount: 0
    });
  }

  quantity.value = 1;
  status.value = "Produk ditambahkan ke keranjang";
  toast.success(status.value);
}

function removeFromCart(productId: string) {
  cart.value = cart.value.filter((item) => item.productId !== productId);
}

function updateQty(productId: string, nextQty: number) {
  const item = cart.value.find((entry) => entry.productId === productId);
  if (!item) {
    return;
  }

  const normalizedQty = Math.max(1, Math.floor(nextQty || 1));
  if (normalizedQty > item.stockOnHand) {
    item.quantity = item.stockOnHand;
    status.value = `Qty ${item.name} melebihi stok (${item.stockOnHand})`;
    toast.warning(status.value);
    return;
  }

  item.quantity = normalizedQty;
}

function updateItemDiscount(productId: string, nextDiscount: number) {
  const item = cart.value.find((entry) => entry.productId === productId);
  if (!item) {
    return;
  }

  const maxDiscount = item.quantity * item.unitPrice;
  const normalizedDiscount = Math.max(0, Number(nextDiscount || 0));
  if (normalizedDiscount > maxDiscount) {
    item.discount = maxDiscount;
    status.value = `Diskon item ${item.name} dibatasi ${formatCurrency(maxDiscount)}`;
    toast.warning(status.value);
    return;
  }

  item.discount = normalizedDiscount;
}

async function submitQuickProduct() {
  if (!canQuickAddProduct.value) {
    status.value = "Akses tambah barang hanya untuk owner/manager";
    toast.error(status.value);
    return;
  }

  if (!selectedStoreId.value) {
    status.value = "Store belum dipilih";
    toast.error(status.value);
    return;
  }

  if (!quickProduct.name.trim() || Number(quickProduct.sellPrice) <= 0) {
    status.value = "Nama barang dan harga jual wajib diisi";
    toast.error(status.value);
    return;
  }

  const duplicateName = products.value.some((item) => item.name.toLowerCase() === quickProduct.name.trim().toLowerCase());
  if (duplicateName) {
    status.value = "Nama barang sudah ada di store ini";
    toast.error(status.value);
    return;
  }

  creatingProduct.value = true;
  try {
    const created = await createProduct({
      storeId: selectedStoreId.value,
      name: quickProduct.name.trim(),
      barcode: quickProduct.barcode.trim() || undefined,
      category: quickProduct.category,
      categoryId: quickProduct.categoryId || undefined,
      brandId: quickProduct.brandId || undefined,
      supplierId: quickProduct.supplierId || undefined,
      unitMeasure: quickProduct.unitMeasure,
      unitValue: Number(quickProduct.unitValue),
      sellCategories: normalizeSellCategories(quickProduct.sellCategories),
      sellPrice: Number(quickProduct.sellPrice),
      minimumStock: Number(quickProduct.minimumStock || 0),
      stockOnHand: Number(quickProduct.stockOnHand || 0)
    });

    resetQuickProductForm();

    await loadProducts();
    selectedProductId.value = created.id;
    status.value = "Barang berhasil ditambahkan";
    toast.success(status.value);
  } catch (error) {
    status.value = getErrorMessage(error, "Gagal menambah barang");
    toast.error(status.value);
  } finally {
    creatingProduct.value = false;
  }
}

async function processCheckout() {
  loading.value = true;
  status.value = "Memproses checkout...";

  const payload = {
    idempotencyKey: crypto.randomUUID(),
    storeId: selectedStoreId.value,
    paymentMethod: paymentMethod.value,
    paymentBreakdown: paymentMethod.value === "split" ? {
      cash: Number(splitPayment.cash || 0),
      qris: Number(splitPayment.qris || 0),
      transfer: Number(splitPayment.transfer || 0)
    } : undefined,
    referenceNumber: referenceNumber.value.trim() || undefined,
    paidAmount: paymentMethod.value === "split"
      ? Number(splitPayment.cash || 0) + Number(splitPayment.qris || 0) + Number(splitPayment.transfer || 0)
      : paymentMethod.value === "cash"
        ? Number(paidAmount.value || 0)
        : paidAmount.value > 0
          ? Number(paidAmount.value)
          : undefined,
    soldAt: new Date().toISOString(),
    promoCode: promoCode.value.trim() || undefined,
    discount: Number(discount.value || 0),
    items: cart.value.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: Number(item.discount || 0)
    }))
  };

  const saveToOutbox = async () => {
    await enqueue({
      id: crypto.randomUUID(),
      endpoint: "/sync/sales",
      createdAt: new Date().toISOString(),
      payload
    });
  };

  try {
    const cartSnapshot = cart.value.map((item) => ({
      name: item.name,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: Math.max(item.unitPrice * item.quantity - item.discount, 0)
    }));

    if (!navigator.onLine) {
      await saveToOutbox();
      status.value = "Offline: transaksi masuk queue lokal";
      toast.warning(status.value);
    } else {
      const response = await postSale(payload);
      const storeName = stores.value.find((store) => store.id === selectedStoreId.value)?.name ?? "Store";
      lastReceipt.value = {
        saleId: response.saleId,
        createdAt: new Date().toISOString(),
        storeName,
        cashierName: auth.user?.fullName ?? "Kasir",
        paymentMethod: paymentMethod.value,
        total: grandTotal.value,
        paidAmount: Number(payload.paidAmount ?? grandTotal.value),
        changeAmount: paymentMethod.value === "cash" ? Math.max(Number(payload.paidAmount ?? 0) - grandTotal.value, 0) : 0,
        items: cartSnapshot
      };
      status.value = "Transaksi berhasil disimpan";
      toast.success(status.value);
    }

    cart.value = [];
    discount.value = 0;
    paidAmount.value = 0;
    referenceNumber.value = "";
    promoCode.value = "";
    splitPayment.cash = 0;
    splitPayment.qris = 0;
    splitPayment.transfer = 0;
    salesHistoryPage.value = 1;
    await Promise.all([loadProducts(), loadSalesHistory()]);
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ERR_NETWORK") {
      await saveToOutbox();
      status.value = "Jaringan putus: transaksi masuk queue lokal";
      toast.warning(status.value);
    } else {
      status.value = getErrorMessage(error, "Checkout gagal");
      toast.error(status.value);
    }
  } finally {
    loading.value = false;
  }
}

function closeCheckoutConfirm() {
  checkoutConfirmOpen.value = false;
}

async function confirmCheckout() {
  checkoutConfirmOpen.value = false;
  await processCheckout();
}

async function checkout() {
  const issues = getCheckoutValidationIssues();
  if (issues.length > 0) {
    status.value = `Lengkapi data checkout: ${issues.join(" • ")}`;
    toast.warning(status.value);
    return;
  }

  checkoutConfirmOpen.value = true;
}

watch(selectedStoreId, () => {
  cart.value = [];
  discount.value = 0;
  paidAmount.value = 0;
  referenceNumber.value = "";
  promoCode.value = "";
  splitPayment.cash = 0;
  splitPayment.qris = 0;
  splitPayment.transfer = 0;
  salesHistoryPage.value = 1;
  void loadProducts();
  void loadPromos();
  void loadSalesHistory();
});

watch(discount, (value) => {
  const maxDiscount = subtotalAfterItemDiscount.value;
  if (value > maxDiscount) {
    discount.value = maxDiscount;
    status.value = `Diskon transaksi dibatasi maksimal ${formatCurrency(maxDiscount)}`;
    toast.warning(status.value);
  }
});

watch(paymentMethod, (method) => {
  if (method !== "split") {
    splitPayment.cash = 0;
    splitPayment.qris = 0;
    splitPayment.transfer = 0;
  }

  if (method === "cash") {
    referenceNumber.value = "";
  }
});

onMounted(async () => {
  try {
    await Promise.all([loadStores(), loadCatalogMasters()]);
    await Promise.all([loadProducts(), loadPromos(), loadInventoryCostingMethod(), loadSalesHistory()]);
  } catch (error) {
    status.value = getErrorMessage(error, "Gagal memuat data POS");
    toast.error(status.value);
  }
});
</script>

<template>
  <section>
    <PageHeader title="POS Kasir" subtitle="Transaksi kasir online/offline dengan sinkronisasi ke backend." />

    <div class="mt-4 inline-flex items-center rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
      Costing: {{ costingMethodLabel() }}
    </div>

    <div class="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
      <select v-model="selectedStoreId" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
      </select>

      <input
        v-model="filter.search"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Cari nama produk"
      />

      <button class="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm" @click="productLovOpen = true">
        {{ selectedProduct ? formatProductName(selectedProduct) : 'Pilih produk (LOV)' }}
      </button>

      <div class="flex gap-2">
        <input
          v-model.number="quantity"
          type="number"
          min="1"
          class="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canAddToCart"
          @click="addToCart"
        >
          Tambah
        </button>
      </div>
      <div v-if="selectedProduct" class="md:col-span-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Stok tersedia: <strong>{{ selectedProduct.stockOnHand }}</strong> • Harga: <strong>{{ formatCurrency(Number(selectedProduct.sellPrice)) }}</strong>
      </div>
    </div>

    <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Produk</th>
            <th class="px-4 py-3">Harga</th>
            <th class="px-4 py-3">Stok</th>
            <th class="px-4 py-3">Qty</th>
            <th class="px-4 py-3">Disc Item</th>
            <th class="px-4 py-3">Subtotal</th>
            <th class="px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in cart" :key="item.productId">
            <td class="px-4 py-3 text-slate-900">{{ item.name }}</td>
            <td class="px-4 py-3">{{ formatCurrency(item.unitPrice) }}</td>
            <td class="px-4 py-3 text-slate-600">{{ item.stockOnHand }}</td>
            <td class="px-4 py-3">
              <input
                :value="item.quantity"
                type="number"
                min="1"
                :max="item.stockOnHand"
                class="w-20 rounded border border-slate-300 px-2 py-1"
                @input="updateQty(item.productId, Number(($event.target as HTMLInputElement).value))"
              />
            </td>
            <td class="px-4 py-3">
              <input
                :value="item.discount"
                type="number"
                min="0"
                class="w-24 rounded border border-slate-300 px-2 py-1"
                @input="updateItemDiscount(item.productId, Number(($event.target as HTMLInputElement).value))"
              />
            </td>
            <td class="px-4 py-3">{{ formatCurrency(Math.max(item.unitPrice * item.quantity - item.discount, 0)) }}</td>
            <td class="px-4 py-3">
              <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="removeFromCart(item.productId)">
                Hapus
              </button>
            </td>
          </tr>
          <tr v-if="cart.length === 0">
            <td colspan="7" class="px-4 py-6 text-center text-slate-500">Belum ada item di keranjang</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
      <div>
        <p class="text-xs text-slate-500">Subtotal</p>
        <p class="text-base font-semibold text-slate-900">{{ formatCurrency(subtotal) }}</p>
        <p class="mt-1 text-xs text-slate-500">Disc Item: {{ formatCurrency(itemDiscountTotal) }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Discount Transaksi</label>
        <input v-model.number="discount" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Promo Code</label>
        <div class="flex gap-2">
          <input
            v-model="promoCode"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Kode promo"
          />
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-xs" @click="promoLovOpen = true">LOV Promo</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">Diskon promo: {{ formatCurrency(promoDiscountPreview) }}</p>
      </div>
      <div>
        <label class="mb-1 block text-xs text-slate-500">Metode Bayar</label>
        <select v-model="paymentMethod" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="cash">Cash</option>
          <option value="qris">QRIS</option>
          <option value="transfer">Transfer</option>
          <option value="split">Split (Cash+QRIS)</option>
        </select>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <p class="text-xs text-slate-500">Total</p>
          <p class="text-base font-semibold text-slate-900">{{ formatCurrency(grandTotal) }}</p>
        </div>
        <LoadingButton
          :loading="loading"
          :disabled="loading"
          loading-text="Proses..."
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          @click="checkout"
        >
          Checkout
        </LoadingButton>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!lastReceipt"
          @click="printLastReceipt"
        >
          Print Struk
        </button>
      </div>
    </div>

    <div class="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
      <div v-if="!isSplitPayment">
        <label class="mb-1 block text-xs text-slate-500">Nominal Bayar</label>
        <input v-model.number="paidAmount" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <p v-if="isCashPayment" class="mt-1 text-xs text-slate-500">Kembalian: {{ formatCurrency(cashChangePreview) }}</p>
      </div>

      <div v-if="requiresReference">
        <label class="mb-1 block text-xs text-slate-500">No Referensi</label>
        <input v-model="referenceNumber" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Ref QRIS/Transfer" />
      </div>

      <template v-if="isSplitPayment">
        <div>
          <label class="mb-1 block text-xs text-slate-500">Split Cash</label>
          <input v-model.number="splitPayment.cash" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs text-slate-500">Split QRIS</label>
          <input v-model.number="splitPayment.qris" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="mb-1 block text-xs text-slate-500">Split Transfer (opsional)</label>
          <input v-model.number="splitPayment.transfer" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div class="md:col-span-4 text-xs text-slate-500">
          Split aktif untuk kombinasi cash + qris (transfer opsional).
        </div>
      </template>
    </div>

    <div class="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">History Belanja</h2>
        <span class="text-xs text-slate-500">{{ salesHistoryLoading ? "Loading..." : `${salesHistoryPagination.total} transaksi` }}</span>
      </div>

      <div class="mt-3 space-y-2 text-sm">
        <p v-if="!salesHistoryLoading && salesHistory.length === 0" class="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">
          Belum ada history transaksi di store ini.
        </p>

        <div
          v-for="sale in salesHistory"
          :key="sale.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
        >
          <div class="min-w-0">
            <p class="font-medium text-slate-800">{{ new Date(sale.soldAt).toLocaleString("id-ID") }} · {{ sale.cashier.fullName }}</p>
            <p class="text-xs text-slate-500">{{ sale.paymentMethod.toUpperCase() }} · Total {{ formatCurrency(Number(sale.total)) }}</p>
          </div>
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1 text-xs"
            @click="openSaleDetail(sale.id)"
          >
            Lihat Detail
          </button>
        </div>
      </div>

      <div class="mt-3 flex items-center justify-end gap-2 text-xs text-slate-600">
        <button
          class="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="salesHistoryPagination.page <= 1"
          @click="prevSalesHistoryPage"
        >
          Prev
        </button>
        <span>{{ salesHistoryPagination.page }} / {{ salesHistoryPagination.totalPages }}</span>
        <button
          class="rounded border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="salesHistoryPagination.page >= salesHistoryPagination.totalPages"
          @click="nextSalesHistoryPage"
        >
          Next
        </button>
      </div>
    </div>

    <div v-if="canQuickAddProduct" class="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6">
      <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
        Kode produk dibuat otomatis saat simpan.
      </p>
      <input
        v-model="quickProduct.name"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
        placeholder="NAMA BARANG (UNIK PER STORE)"
        @input="quickProduct.name = quickProduct.name.toUpperCase()"
      />
      <input
        v-model="quickProduct.barcode"
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Barcode (opsional)"
      />
      <select v-model="quickProduct.category" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="cair">cair</option>
        <option value="padat">padat</option>
      </select>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="openCategoryLov"
      >
        {{ getCategoryName(quickProduct.categoryId) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="openBrandLov"
      >
        {{ getBrandName(quickProduct.brandId) }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
        @click="openSupplierLov"
      >
        {{ getSupplierName(quickProduct.supplierId) }}
      </button>
      <input v-model.number="quickProduct.unitValue" type="number" min="0.01" step="0.01" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Ukuran satuan" />
      <select v-model="quickProduct.unitMeasure" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="unit in UNIT_OPTIONS" :key="unit" :value="unit">{{ unit }}</option>
      </select>
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 md:col-span-2"
        @click="openSellCategoryLov"
      >
        {{ formatSellCategoriesLabel(quickProduct.sellCategories) }}
      </button>
      <input v-model.number="quickProduct.sellPrice" type="number" min="0" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Harga jual" />
      <input v-model.number="quickProduct.minimumStock" type="number" min="0" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Min stok" />
      <input v-model.number="quickProduct.stockOnHand" type="number" min="0" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Stok awal" />
      <div class="flex items-end justify-end gap-2 md:col-span-6">
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          @click="resetQuickProductForm"
        >
          Cancel
        </button>
        <LoadingButton
          :loading="creatingProduct"
          loading-text="Menambah..."
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          @click="submitQuickProduct"
        >
          Simpan Barang Cepat
        </LoadingButton>
      </div>
    </div>

    <div v-else class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      Fitur <strong>Tambah Barang Cepat</strong> hanya tersedia untuk role owner/manager.
    </div>

    <p v-if="status" class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{{ status }}</p>

    <div v-if="checkoutConfirmOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeCheckoutConfirm">
      <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4">
        <h3 class="text-base font-semibold text-slate-900">Konfirmasi Checkout</h3>
        <p class="mt-2 text-sm text-slate-600">Apakah Anda yakin lanjut checkout transaksi ini?</p>

        <div class="mt-3 grid gap-2 text-sm">
          <div class="rounded-lg bg-slate-50 px-3 py-2">Metode Bayar: <strong>{{ paymentMethod.toUpperCase() }}</strong></div>
          <div class="rounded-lg bg-slate-50 px-3 py-2">Total: <strong>{{ formatCurrency(grandTotal) }}</strong></div>
          <div class="rounded-lg bg-slate-50 px-3 py-2">Nominal Bayar: <strong>{{ formatCurrency(checkoutPaidPreview()) }}</strong></div>
          <div class="rounded-lg bg-slate-50 px-3 py-2">Sisa Bayar: <strong>{{ formatCurrency(checkoutRemainingPreview()) }}</strong></div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="closeCheckoutConfirm"
          >
            Batal
          </button>
          <LoadingButton
            :loading="loading"
            loading-text="Proses..."
            class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
            @click="confirmCheckout"
          >
            Lanjut Checkout
          </LoadingButton>
        </div>
      </div>
    </div>

    <div v-if="saleDetailOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeSaleDetail">
      <div class="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Detail History Belanja</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeSaleDetail">Tutup</button>
        </div>

        <p v-if="saleDetailLoading" class="mt-3 text-sm text-slate-600">Memuat detail transaksi...</p>

        <template v-if="selectedSaleDetail">
          <div class="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <div class="rounded-lg bg-slate-50 px-3 py-2">Tanggal: <strong>{{ new Date(selectedSaleDetail.soldAt).toLocaleString("id-ID") }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Kasir: <strong>{{ selectedSaleDetail.cashier.fullName }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Metode: <strong>{{ selectedSaleDetail.paymentMethod.toUpperCase() }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Total: <strong>{{ formatCurrency(Number(selectedSaleDetail.total)) }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Nominal Bayar: <strong>{{ formatCurrency(getPaidAmount(selectedSaleDetail)) }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Sisa Bayar: <strong>{{ formatCurrency(getRemainingAmount(selectedSaleDetail)) }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">Kembalian: <strong>{{ formatCurrency(getChangeAmount(selectedSaleDetail)) }}</strong></div>
            <div class="rounded-lg bg-slate-50 px-3 py-2">No Referensi: <strong>{{ selectedSaleDetail.referenceNumber || "-" }}</strong></div>
          </div>

          <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-sm">
              <thead class="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th class="px-3 py-2">Barang</th>
                  <th class="px-3 py-2">Qty</th>
                  <th class="px-3 py-2">Harga</th>
                  <th class="px-3 py-2">Diskon</th>
                  <th class="px-3 py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="item in selectedSaleDetail.items" :key="item.id">
                  <td class="px-3 py-2">{{ item.product.name }}</td>
                  <td class="px-3 py-2">{{ item.quantity }}</td>
                  <td class="px-3 py-2">{{ formatCurrency(Number(item.unitPrice)) }}</td>
                  <td class="px-3 py-2">{{ formatCurrency(Number(item.discount)) }}</td>
                  <td class="px-3 py-2">{{ formatCurrency(Number(item.lineTotal)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>

    <div v-if="productLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="productLovOpen = false">
      <div class="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Produk</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="productLovOpen = false">Tutup</button>
        </div>
        <input v-model="productLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari nama produk" />
        <div class="mt-3 max-h-[360px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Nama</th>
                <th class="px-4 py-2">Stok</th>
                <th class="px-4 py-2">Harga</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="product in filteredProducts" :key="product.id">
                <td class="px-4 py-2">{{ formatProductName(product) }}</td>
                <td class="px-4 py-2">{{ product.stockOnHand }}</td>
                <td class="px-4 py-2">{{ formatCurrency(Number(product.sellPrice)) }}</td>
                <td class="px-4 py-2">
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectProductFromLov(product.id)">Pilih</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="promoLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="promoLovOpen = false">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Promo</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="promoLovOpen = false">Tutup</button>
        </div>
        <input v-model="promoLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari promo by code" />
        <div class="mt-3 max-h-[320px] overflow-auto rounded border border-slate-200">
          <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-4 py-2">Code</th>
                <th class="px-4 py-2">Diskon</th>
                <th class="px-4 py-2">Kategori</th>
                <th class="px-4 py-2">Periode</th>
                <th class="px-4 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="promo in filteredPromos" :key="promo.id">
                <td class="px-4 py-2">{{ promo.code }}</td>
                <td class="px-4 py-2">{{ promo.discountPercent }}%</td>
                <td class="px-4 py-2">{{ promo.category || '-' }}</td>
                <td class="px-4 py-2 text-xs">{{ new Date(promo.startAt).toLocaleDateString('id-ID') }} - {{ new Date(promo.endAt).toLocaleDateString('id-ID') }}</td>
                <td class="px-4 py-2">
                  <button
                    :disabled="!isPromoActiveNow(promo)"
                    class="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                    @click="selectPromoFromLov(promo.code)"
                  >
                    Pilih
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="sellCategoryLovOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="closeSellCategoryLov">
      <div class="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-slate-900">Pilih Kategori Jual</h3>
          <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="closeSellCategoryLov">Tutup</button>
        </div>
        <p class="mt-1 text-xs text-slate-500">Pilih satu atau lebih kategori jual untuk produk cepat.</p>
        <input v-model="sellCategoryLovSearch" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari kategori..." />

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
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectCategoryFromLov(item.id)">Pilih</button>
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
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectBrandFromLov(item.id)">Pilih</button>
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
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" @click="selectSupplierFromLov(item.id)">Pilih</button>
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
