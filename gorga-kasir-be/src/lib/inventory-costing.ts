import { prisma } from "./prisma";
import {
  getTenantFinanceSettings,
  saveTenantFinanceSettings,
  type InventoryFifoLayer,
  type TenantFinanceSettings
} from "./tenant-finance-settings";

function buildLayerKey(storeId: string, productId: string) {
  return `${storeId}:${productId}`;
}

function normalizeLayers(layers: InventoryFifoLayer[]) {
  return layers.filter((layer) => Number(layer.quantity) > 0);
}

export async function addFifoLayer(
  tenantId: string,
  params: {
    storeId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    receivedAt?: string;
    purchaseId?: string;
  },
  settingsOverride?: TenantFinanceSettings,
  dbClient: typeof prisma = prisma
) {
  const settings = settingsOverride ?? await getTenantFinanceSettings(tenantId, dbClient);
  if (settings.inventoryCostingMethod !== "fifo") {
    return settings;
  }

  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return settings;
  }

  const unitCost = Number(params.unitCost);
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return settings;
  }

  const key = buildLayerKey(params.storeId, params.productId);
  const currentLayers = settings.fifoLayers?.[key] ?? [];
  const nextLayers = [...currentLayers, {
    quantity: qty,
    unitCost,
    receivedAt: params.receivedAt ?? new Date().toISOString(),
    ...(params.purchaseId ? { purchaseId: params.purchaseId } : {})
  }];

  const nextSettings: TenantFinanceSettings = {
    ...settings,
    inventoryCostingMethod: "fifo",
    fifoLayers: {
      ...(settings.fifoLayers ?? {}),
      [key]: normalizeLayers(nextLayers)
    }
  };

  await saveTenantFinanceSettings(tenantId, nextSettings, dbClient);
  return nextSettings;
}

export async function consumeFifoLayers(
  tenantId: string,
  params: {
    storeId: string;
    productId: string;
    quantity: number;
  },
  settingsOverride?: TenantFinanceSettings,
  dbClient: typeof prisma = prisma
) {
  const settings = settingsOverride ?? await getTenantFinanceSettings(tenantId, dbClient);
  if (settings.inventoryCostingMethod !== "fifo") {
    return settings;
  }

  let remaining = Number(params.quantity);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return settings;
  }

  const key = buildLayerKey(params.storeId, params.productId);
  const layers = [...(settings.fifoLayers?.[key] ?? [])];

  let index = 0;
  while (remaining > 0 && index < layers.length) {
    const layer = layers[index];
    if (layer.quantity <= remaining) {
      remaining -= layer.quantity;
      layer.quantity = 0;
      index += 1;
      continue;
    }

    layer.quantity -= remaining;
    remaining = 0;
  }

  const nextSettings: TenantFinanceSettings = {
    ...settings,
    inventoryCostingMethod: "fifo",
    fifoLayers: {
      ...(settings.fifoLayers ?? {}),
      [key]: normalizeLayers(layers)
    }
  };

  await saveTenantFinanceSettings(tenantId, nextSettings, dbClient);
  return nextSettings;
}
