import { prisma } from "./prisma";

type ClosingHistoryItem = {
  closedAt: string;
  closedThroughAt: string;
  closedByUserId: string;
};

export type InventoryCostingMethod = "weighted_average" | "fifo";

export type InventoryFifoLayer = {
  quantity: number;
  unitCost: number;
  receivedAt: string;
  purchaseId?: string;
};

export type TenantFinanceSettings = {
  closedThroughAt?: string;
  settledPurchaseIds?: string[];
  closureHistory?: ClosingHistoryItem[];
  inventoryCostingMethod?: InventoryCostingMethod;
  fifoLayers?: Record<string, InventoryFifoLayer[]>;
};

type TenantAdditionalData = {
  finance?: TenantFinanceSettings;
  [key: string]: unknown;
};

export async function getTenantFinanceSettings(
  tenantId: string,
  dbClient: typeof prisma = prisma
): Promise<TenantFinanceSettings> {
  const tenant = await dbClient.tenant.findUnique({
    where: { id: tenantId },
    select: { additionalData: true }
  });

  if (!tenant?.additionalData || typeof tenant.additionalData !== "object") {
    return {};
  }

  const additionalData = tenant.additionalData as TenantAdditionalData;
  const finance = additionalData.finance;

  if (!finance || typeof finance !== "object") {
    return {};
  }

  const settledPurchaseIds = Array.isArray(finance.settledPurchaseIds)
    ? finance.settledPurchaseIds.filter((item): item is string => typeof item === "string")
    : [];

  const closureHistory = Array.isArray(finance.closureHistory)
    ? finance.closureHistory.filter((item): item is ClosingHistoryItem => {
      return Boolean(
        item
        && typeof item === "object"
        && typeof item.closedAt === "string"
        && typeof item.closedThroughAt === "string"
        && typeof item.closedByUserId === "string"
      );
    })
    : [];

  const inventoryCostingMethod = finance.inventoryCostingMethod === "fifo"
    ? "fifo"
    : "weighted_average";

  const fifoLayers = finance.fifoLayers && typeof finance.fifoLayers === "object"
    ? Object.entries(finance.fifoLayers as Record<string, unknown>).reduce<Record<string, InventoryFifoLayer[]>>((acc, [key, value]) => {
      if (!Array.isArray(value)) {
        return acc;
      }

      const parsedLayers = value
        .map((layer) => {
          if (!layer || typeof layer !== "object") {
            return null;
          }

          const record = layer as Record<string, unknown>;
          const quantity = Number(record.quantity ?? 0);
          const unitCost = Number(record.unitCost ?? 0);
          const receivedAt = typeof record.receivedAt === "string" ? record.receivedAt : null;
          const purchaseId = typeof record.purchaseId === "string" ? record.purchaseId : undefined;

          if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0 || !receivedAt) {
            return null;
          }

          return { quantity, unitCost, receivedAt, ...(purchaseId ? { purchaseId } : {}) };
        })
        .filter((layer): layer is InventoryFifoLayer => Boolean(layer));

      if (parsedLayers.length > 0) {
        acc[key] = parsedLayers;
      }

      return acc;
    }, {})
    : {};

  return {
    ...(typeof finance.closedThroughAt === "string" ? { closedThroughAt: finance.closedThroughAt } : {}),
    ...(settledPurchaseIds.length ? { settledPurchaseIds } : {}),
    ...(closureHistory.length ? { closureHistory } : {}),
    inventoryCostingMethod,
    ...(Object.keys(fifoLayers).length ? { fifoLayers } : {})
  };
}

export async function saveTenantFinanceSettings(
  tenantId: string,
  nextSettings: TenantFinanceSettings,
  dbClient: typeof prisma = prisma
) {
  const tenant = await dbClient.tenant.findUnique({
    where: { id: tenantId },
    select: { additionalData: true }
  });

  const additionalData: TenantAdditionalData = tenant?.additionalData && typeof tenant.additionalData === "object"
    ? { ...(tenant.additionalData as TenantAdditionalData) }
    : {};

  additionalData.finance = {
    ...(nextSettings.closedThroughAt ? { closedThroughAt: nextSettings.closedThroughAt } : {}),
    settledPurchaseIds: nextSettings.settledPurchaseIds ?? [],
    closureHistory: nextSettings.closureHistory ?? [],
    inventoryCostingMethod: nextSettings.inventoryCostingMethod ?? "weighted_average",
    fifoLayers: nextSettings.fifoLayers ?? {}
  };

  await dbClient.tenant.update({
    where: { id: tenantId },
    data: {
      additionalData: additionalData as unknown as object
    }
  });
}
