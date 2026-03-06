import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "../src/lib/prisma";

async function main() {
  const demoPasswordHash = await bcrypt.hash("password123", 10);
  const superAdminEmail = process.env.SUPERADMIN_EMAIL;
  const superAdminPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 10);

  const tenantMain = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Klontong Demo Tenant",
      status: "active",
      fullName: "Owner Demo",
      contactPhone: "081234567890",
      address: "Kampung Barat",
      approvedAt: new Date("2026-03-01T00:10:00.000Z"),
      approvedBy: "seed-super-admin"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Klontong Demo Tenant",
      status: "active",
      fullName: "Owner Demo",
      contactPhone: "081234567890",
      address: "Kampung Barat",
      approvedAt: new Date("2026-03-01T00:10:00.000Z"),
      approvedBy: "seed-super-admin"
    }
  });

  const tenantPastDue = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: { name: "Tenant Past Due", status: "inactive" },
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      name: "Tenant Past Due",
      status: "inactive"
    }
  });

  const tenantInactive = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000102" },
    update: { name: "Tenant Inactive", status: "inactive" },
    create: {
      id: "00000000-0000-0000-0000-000000000102",
      name: "Tenant Inactive",
      status: "inactive"
    }
  });

  const tenantUnpaidPending = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000105" },
    update: {
      name: "Tenant Pending Unpaid",
      status: "pending_approval",
      fullName: "Owner Pending",
      contactPhone: "081199988877",
      address: "Kampung Pending"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000105",
      name: "Tenant Pending Unpaid",
      status: "pending_approval",
      fullName: "Owner Pending",
      contactPhone: "081199988877",
      address: "Kampung Pending"
    }
  });

  await prisma.subscription.deleteMany({
    where: {
      tenantId: {
        in: [tenantMain.id, tenantPastDue.id, tenantInactive.id, tenantUnpaidPending.id]
      }
    }
  });

  await prisma.subscription.upsert({
    where: { id: "00000000-0000-0000-0000-000000000201" },
    update: {
      tenantId: tenantMain.id,
      plan: "starter",
      status: "active",
      paymentStatus: "paid",
      trialEnabled: true,
      startsAt: new Date("2026-03-01T00:00:00.000Z"),
      endsAt: new Date("2026-04-01T00:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000201",
      tenantId: tenantMain.id,
      plan: "starter",
      status: "active",
      paymentStatus: "paid",
      trialEnabled: true,
      startsAt: new Date("2026-03-01T00:00:00.000Z"),
      endsAt: new Date("2026-04-01T00:00:00.000Z")
    }
  });

  await prisma.subscription.upsert({
    where: { id: "00000000-0000-0000-0000-000000000202" },
    update: {
      tenantId: tenantPastDue.id,
      plan: "starter",
      status: "past_due",
      paymentStatus: "unpaid",
      trialEnabled: false,
      startsAt: new Date("2026-02-01T00:00:00.000Z"),
      endsAt: new Date("2026-03-01T00:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000202",
      tenantId: tenantPastDue.id,
      plan: "starter",
      status: "past_due",
      paymentStatus: "unpaid",
      trialEnabled: false,
      startsAt: new Date("2026-02-01T00:00:00.000Z"),
      endsAt: new Date("2026-03-01T00:00:00.000Z")
    }
  });

  await prisma.subscription.upsert({
    where: { id: "00000000-0000-0000-0000-000000000203" },
    update: {
      tenantId: tenantInactive.id,
      plan: "starter",
      status: "inactive",
      paymentStatus: "unpaid",
      trialEnabled: false,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-02-01T00:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000203",
      tenantId: tenantInactive.id,
      plan: "starter",
      status: "inactive",
      paymentStatus: "unpaid",
      trialEnabled: false,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-02-01T00:00:00.000Z")
    }
  });

  await prisma.subscription.upsert({
    where: { id: "00000000-0000-0000-0000-000000000204" },
    update: {
      tenantId: tenantUnpaidPending.id,
      plan: "1_month",
      status: "inactive",
      paymentStatus: "unpaid",
      trialEnabled: true,
      startsAt: new Date("2026-03-04T00:00:00.000Z"),
      endsAt: null
    },
    create: {
      id: "00000000-0000-0000-0000-000000000204",
      tenantId: tenantUnpaidPending.id,
      plan: "1_month",
      status: "inactive",
      paymentStatus: "unpaid",
      trialEnabled: true,
      startsAt: new Date("2026-03-04T00:00:00.000Z"),
      endsAt: null
    }
  });

  const storeA = await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Toko Aunty",
      address: "Kampung Barat",
      isActive: true
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenantMain.id,
      name: "Toko Aunty",
      address: "Kampung Barat",
      isActive: true
    }
  });

  const storeBPending = await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {
      name: "Toko Bintang",
      address: "Kampung Timur",
      isActive: false
    },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      tenantId: tenantMain.id,
      name: "Toko Bintang",
      address: "Kampung Timur",
      isActive: false
    }
  });

  await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000103" },
    update: { name: "Store Past Due", address: "Area Selatan", isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000103",
      tenantId: tenantPastDue.id,
      name: "Store Past Due",
      address: "Area Selatan",
      isActive: true
    }
  });

  await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000104" },
    update: { name: "Store Inactive", address: "Area Utara", isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000104",
      tenantId: tenantInactive.id,
      name: "Store Inactive",
      address: "Area Utara",
      isActive: true
    }
  });

  await prisma.store.upsert({
    where: { id: "00000000-0000-0000-0000-000000000105" },
    update: { name: "Store Pending", address: "Kampung Pending", isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000105",
      tenantId: tenantUnpaidPending.id,
      name: "Store Pending",
      address: "Kampung Pending",
      isActive: true
    }
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@klontong.local" },
    update: {
      tenantId: tenantMain.id,
      username: "owner.demo",
      fullName: "Owner Demo",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081234567890",
      jobResponsibility: "Store Owner"
    },
    create: {
      tenantId: tenantMain.id,
      username: "owner.demo",
      fullName: "Owner Demo",
      email: "owner@klontong.local",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081234567890",
      jobResponsibility: "Store Owner"
    }
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: { tenantId: tenantMain.id, username: "superadmin.demo", fullName: "Super Admin Demo", passwordHash: superAdminPassword, role: "owner", isActive: true, jobResponsibility: "Super Admin" },
    create: {
      tenantId: tenantMain.id,
      username: "superadmin.demo",
      fullName: "Super Admin Demo",
      email: superAdminEmail,
      passwordHash: superAdminPassword,
      role: "owner",
      isActive: true,
      jobResponsibility: "Super Admin"
    }
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@klontong.local" },
    update: {
      tenantId: tenantMain.id,
      username: "manager.demo",
      fullName: "Manager Demo",
      passwordHash: demoPasswordHash,
      role: "manager",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081200000111",
      jobResponsibility: "Operasional Toko dan Inventory"
    },
    create: {
      tenantId: tenantMain.id,
      username: "manager.demo",
      fullName: "Manager Demo",
      email: "manager@klontong.local",
      passwordHash: demoPasswordHash,
      role: "manager",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081200000111",
      jobResponsibility: "Operasional Toko dan Inventory"
    }
  });

  const cashier = await prisma.user.upsert({
    where: { email: "cashier@klontong.local" },
    update: {
      tenantId: tenantMain.id,
      username: "cashier.demo",
      fullName: "Kasir Demo",
      passwordHash: demoPasswordHash,
      role: "cashier",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081200000222",
      jobResponsibility: "Transaksi Kasir dan Shift"
    },
    create: {
      tenantId: tenantMain.id,
      username: "cashier.demo",
      fullName: "Kasir Demo",
      email: "cashier@klontong.local",
      passwordHash: demoPasswordHash,
      role: "cashier",
      isActive: true,
      address: "Kampung Barat",
      phoneNumber: "081200000222",
      jobResponsibility: "Transaksi Kasir dan Shift"
    }
  });

  await prisma.user.upsert({
    where: { email: "owner+pastdue@klontong.local" },
    update: { tenantId: tenantPastDue.id, username: "owner.pastdue", fullName: "Owner Past Due", passwordHash: demoPasswordHash, role: "owner", isActive: false, jobResponsibility: "Store Owner" },
    create: {
      tenantId: tenantPastDue.id,
      username: "owner.pastdue",
      fullName: "Owner Past Due",
      email: "owner+pastdue@klontong.local",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: false,
      jobResponsibility: "Store Owner"
    }
  });

  await prisma.user.upsert({
    where: { email: "owner+inactive@klontong.local" },
    update: { tenantId: tenantInactive.id, username: "owner.inactive", fullName: "Owner Inactive", passwordHash: demoPasswordHash, role: "owner", isActive: false, jobResponsibility: "Store Owner" },
    create: {
      tenantId: tenantInactive.id,
      username: "owner.inactive",
      fullName: "Owner Inactive",
      email: "owner+inactive@klontong.local",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: false,
      jobResponsibility: "Store Owner"
    }
  });

  const pendingOwner = await prisma.user.upsert({
    where: { email: "owner+pendingunpaid@klontong.local" },
    update: {
      tenantId: tenantUnpaidPending.id,
      username: "owner.pending",
      fullName: "Owner Pending Unpaid",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: false,
      address: "Kampung Pending",
      phoneNumber: "081199988877",
      jobResponsibility: "Store Owner"
    },
    create: {
      tenantId: tenantUnpaidPending.id,
      username: "owner.pending",
      fullName: "Owner Pending Unpaid",
      email: "owner+pendingunpaid@klontong.local",
      passwordHash: demoPasswordHash,
      role: "owner",
      isActive: false,
      address: "Kampung Pending",
      phoneNumber: "081199988877",
      jobResponsibility: "Store Owner"
    }
  });

  const accesses = [
    { userId: superAdmin.id, storeId: storeA.id },
    { userId: superAdmin.id, storeId: storeBPending.id },
    { userId: owner.id, storeId: storeA.id },
    { userId: owner.id, storeId: storeBPending.id },
    { userId: manager.id, storeId: storeA.id },
    { userId: cashier.id, storeId: storeA.id },
    { userId: pendingOwner.id, storeId: "00000000-0000-0000-0000-000000000105" }
  ];

  for (const access of accesses) {
    await prisma.userStoreAccess.upsert({
      where: { userId_storeId: { userId: access.userId, storeId: access.storeId } },
      update: {},
      create: { userId: access.userId, storeId: access.storeId }
    });
  }

  const productA = await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-001" } },
    update: { name: "Beras 5kg", category: "Sembako", costPrice: 4200, sellPrice: 5000, stockOnHand: 95, minimumStock: 10, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      storeId: storeA.id,
      sku: "SKU-001",
      name: "Beras 5kg",
      category: "Sembako",
      costPrice: 4200,
      sellPrice: 5000,
      stockOnHand: 95,
      minimumStock: 10,
      isActive: true
    }
  });

  const productB = await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-002" } },
    update: { name: "Minyak Goreng 1L", category: "Sembako", costPrice: 15000, sellPrice: 18000, stockOnHand: 78, minimumStock: 10, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      storeId: storeA.id,
      sku: "SKU-002",
      name: "Minyak Goreng 1L",
      category: "Sembako",
      costPrice: 15000,
      sellPrice: 18000,
      stockOnHand: 78,
      minimumStock: 10,
      isActive: true
    }
  });

  const productLowStock = await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-003" } },
    update: { name: "Telur 1kg", category: "Protein", costPrice: 25000, sellPrice: 28000, stockOnHand: 4, minimumStock: 8, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000014",
      storeId: storeA.id,
      sku: "SKU-003",
      name: "Telur 1kg",
      category: "Protein",
      costPrice: 25000,
      sellPrice: 28000,
      stockOnHand: 4,
      minimumStock: 8,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeBPending.id, sku: "SKU-PENDING-01" } },
    update: { name: "Gula 1kg", category: "Sembako", costPrice: 13000, sellPrice: 16000, stockOnHand: 30, minimumStock: 5, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000013",
      storeId: storeBPending.id,
      sku: "SKU-PENDING-01",
      name: "Gula 1kg",
      category: "Sembako",
      costPrice: 13000,
      sellPrice: 16000,
      stockOnHand: 30,
      minimumStock: 5,
      isActive: true
    }
  });

  const productC = await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-004" } },
    update: { name: "Gula 1kg", category: "Sembako", costPrice: 13500, sellPrice: 16500, stockOnHand: 52, minimumStock: 8, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000015",
      storeId: storeA.id,
      sku: "SKU-004",
      name: "Gula 1kg",
      category: "Sembako",
      costPrice: 13500,
      sellPrice: 16500,
      stockOnHand: 52,
      minimumStock: 8,
      isActive: true
    }
  });

  const productD = await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-005" } },
    update: { name: "Susu UHT 1L", category: "Minuman", costPrice: 14500, sellPrice: 17500, stockOnHand: 36, minimumStock: 6, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000016",
      storeId: storeA.id,
      sku: "SKU-005",
      name: "Susu UHT 1L",
      category: "Minuman",
      costPrice: 14500,
      sellPrice: 17500,
      stockOnHand: 36,
      minimumStock: 6,
      isActive: true
    }
  });

  const categorySembako = await prisma.category.upsert({
    where: { id: "10000000-0000-0000-0000-000000000001" },
    update: { tenantId: tenantMain.id, name: "Sembako", isActive: true },
    create: {
      id: "10000000-0000-0000-0000-000000000001",
      tenantId: tenantMain.id,
      name: "Sembako",
      isActive: true
    }
  });

  const categoryMinuman = await prisma.category.upsert({
    where: { id: "10000000-0000-0000-0000-000000000002" },
    update: { tenantId: tenantMain.id, name: "Minuman", isActive: true },
    create: {
      id: "10000000-0000-0000-0000-000000000002",
      tenantId: tenantMain.id,
      name: "Minuman",
      isActive: true
    }
  });

  const categoryProtein = await prisma.category.upsert({
    where: { id: "10000000-0000-0000-0000-000000000003" },
    update: { tenantId: tenantMain.id, name: "Protein", isActive: true },
    create: {
      id: "10000000-0000-0000-0000-000000000003",
      tenantId: tenantMain.id,
      name: "Protein",
      isActive: true
    }
  });

  const brandGenerik = await prisma.brand.upsert({
    where: { id: "20000000-0000-0000-0000-000000000001" },
    update: { tenantId: tenantMain.id, name: "Generik", isActive: true },
    create: {
      id: "20000000-0000-0000-0000-000000000001",
      tenantId: tenantMain.id,
      name: "Generik",
      isActive: true
    }
  });

  const brandNusantara = await prisma.brand.upsert({
    where: { id: "20000000-0000-0000-0000-000000000002" },
    update: { tenantId: tenantMain.id, name: "Nusantara", isActive: true },
    create: {
      id: "20000000-0000-0000-0000-000000000002",
      tenantId: tenantMain.id,
      name: "Nusantara",
      isActive: true
    }
  });

  const supplierSatu = await prisma.supplier.upsert({
    where: { id: "30000000-0000-0000-0000-000000000001" },
    update: {
      tenantId: tenantMain.id,
      name: "PT Supplier Satu",
      phone: "021-9000001",
      address: "Jakarta",
      isActive: true
    },
    create: {
      id: "30000000-0000-0000-0000-000000000001",
      tenantId: tenantMain.id,
      name: "PT Supplier Satu",
      phone: "021-9000001",
      address: "Jakarta",
      isActive: true
    }
  });

  const supplierDua = await prisma.supplier.upsert({
    where: { id: "30000000-0000-0000-0000-000000000002" },
    update: {
      tenantId: tenantMain.id,
      name: "CV Supplier Dua",
      phone: "021-9000002",
      address: "Bandung",
      isActive: true
    },
    create: {
      id: "30000000-0000-0000-0000-000000000002",
      tenantId: tenantMain.id,
      name: "CV Supplier Dua",
      phone: "021-9000002",
      address: "Bandung",
      isActive: true
    }
  });

  await prisma.product.update({
    where: { id: productA.id },
    data: { barcode: "8990000000001", categoryId: categorySembako.id, brandId: brandGenerik.id }
  });

  await prisma.product.update({
    where: { id: productB.id },
    data: { barcode: "8990000000002", categoryId: categorySembako.id, brandId: brandNusantara.id }
  });

  await prisma.product.update({
    where: { id: productLowStock.id },
    data: { barcode: "8990000000003", categoryId: categoryProtein.id, brandId: brandGenerik.id }
  });

  await prisma.product.update({
    where: { id: productC.id },
    data: { barcode: "8990000000004", categoryId: categorySembako.id, brandId: brandNusantara.id }
  });

  await prisma.product.update({
    where: { id: productD.id },
    data: { barcode: "8990000000005", categoryId: categoryMinuman.id, brandId: brandNusantara.id }
  });

  await prisma.productSupplier.upsert({
    where: {
      productId_supplierId: {
        productId: productA.id,
        supplierId: supplierSatu.id
      }
    },
    update: { supplierPrice: 4200, leadTimeDays: 2, isPrimary: true },
    create: {
      productId: productA.id,
      supplierId: supplierSatu.id,
      supplierPrice: 4200,
      leadTimeDays: 2,
      isPrimary: true
    }
  });

  await prisma.productSupplier.upsert({
    where: {
      productId_supplierId: {
        productId: productB.id,
        supplierId: supplierSatu.id
      }
    },
    update: { supplierPrice: 15000, leadTimeDays: 3, isPrimary: true },
    create: {
      productId: productB.id,
      supplierId: supplierSatu.id,
      supplierPrice: 15000,
      leadTimeDays: 3,
      isPrimary: true
    }
  });

  await prisma.productSupplier.upsert({
    where: {
      productId_supplierId: {
        productId: productC.id,
        supplierId: supplierDua.id
      }
    },
    update: { supplierPrice: 13500, leadTimeDays: 4, isPrimary: true },
    create: {
      productId: productC.id,
      supplierId: supplierDua.id,
      supplierPrice: 13500,
      leadTimeDays: 4,
      isPrimary: true
    }
  });

  await prisma.productSupplier.upsert({
    where: {
      productId_supplierId: {
        productId: productD.id,
        supplierId: supplierDua.id
      }
    },
    update: { supplierPrice: 14500, leadTimeDays: 4, isPrimary: true },
    create: {
      productId: productD.id,
      supplierId: supplierDua.id,
      supplierPrice: 14500,
      leadTimeDays: 4,
      isPrimary: true
    }
  });

  await prisma.product.upsert({
    where: { storeId_sku: { storeId: storeA.id, sku: "SKU-006" } },
    update: { name: "Mie Instan", category: "Makanan", costPrice: 2500, sellPrice: 3500, stockOnHand: 180, minimumStock: 25, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000017",
      storeId: storeA.id,
      sku: "SKU-006",
      name: "Mie Instan",
      category: "Makanan",
      costPrice: 2500,
      sellPrice: 3500,
      stockOnHand: 180,
      minimumStock: 25,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { storeId_sku: { storeId: "00000000-0000-0000-0000-000000000103", sku: "SKU-PASTDUE-01" } },
    update: { name: "Kopi Sachet", category: "Minuman", costPrice: 1200, sellPrice: 2000, stockOnHand: 44, minimumStock: 10, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000018",
      storeId: "00000000-0000-0000-0000-000000000103",
      sku: "SKU-PASTDUE-01",
      name: "Kopi Sachet",
      category: "Minuman",
      costPrice: 1200,
      sellPrice: 2000,
      stockOnHand: 44,
      minimumStock: 10,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { storeId_sku: { storeId: "00000000-0000-0000-0000-000000000104", sku: "SKU-INACTIVE-01" } },
    update: { name: "Teh Celup", category: "Minuman", costPrice: 9000, sellPrice: 12000, stockOnHand: 28, minimumStock: 7, isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000019",
      storeId: "00000000-0000-0000-0000-000000000104",
      sku: "SKU-INACTIVE-01",
      name: "Teh Celup",
      category: "Minuman",
      costPrice: 9000,
      sellPrice: 12000,
      stockOnHand: 28,
      minimumStock: 7,
      isActive: true
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000050" },
    update: { storeId: storeA.id, productId: productA.id, type: "in", quantity: 20, reason: "restock_supplier", referenceId: "PO-20260301-001" },
    create: {
      id: "00000000-0000-0000-0000-000000000050",
      storeId: storeA.id,
      productId: productA.id,
      type: "in",
      quantity: 20,
      reason: "restock_supplier",
      referenceId: "PO-20260301-001"
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000051" },
    update: { storeId: storeA.id, productId: productB.id, type: "out", quantity: 2, reason: "barang_rusak", referenceId: "WASTE-20260301-001" },
    create: {
      id: "00000000-0000-0000-0000-000000000051",
      storeId: storeA.id,
      productId: productB.id,
      type: "out",
      quantity: 2,
      reason: "barang_rusak",
      referenceId: "WASTE-20260301-001"
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000052" },
    update: { storeId: storeA.id, productId: productLowStock.id, type: "adjustment", quantity: 4, reason: "stok_opname", referenceId: "SO-20260301-001" },
    create: {
      id: "00000000-0000-0000-0000-000000000052",
      storeId: storeA.id,
      productId: productLowStock.id,
      type: "adjustment",
      quantity: 4,
      reason: "stok_opname",
      referenceId: "SO-20260301-001"
    }
  });

  await prisma.expense.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    update: { title: "Listrik Bulanan", amount: 250000, notes: "Tagihan PLN", spentAt: new Date("2026-03-01T08:00:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000020",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      title: "Listrik Bulanan",
      amount: 250000,
      notes: "Tagihan PLN",
      spentAt: new Date("2026-03-01T08:00:00.000Z")
    }
  });

  await prisma.expense.upsert({
    where: { id: "00000000-0000-0000-0000-000000000021" },
    update: { title: "Biaya Internet", amount: 150000, notes: "Paket bulanan internet toko", spentAt: new Date("2026-03-01T09:00:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000021",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: owner.id,
      title: "Biaya Internet",
      amount: 150000,
      notes: "Paket bulanan internet toko",
      spentAt: new Date("2026-03-01T09:00:00.000Z")
    }
  });

  await prisma.expense.upsert({
    where: { id: "00000000-0000-0000-0000-000000000022" },
    update: { title: "Biaya Kebersihan", amount: 80000, notes: "Alat kebersihan mingguan", spentAt: new Date("2026-03-02T08:00:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000022",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      title: "Biaya Kebersihan",
      amount: 80000,
      notes: "Alat kebersihan mingguan",
      spentAt: new Date("2026-03-02T08:00:00.000Z")
    }
  });

  await prisma.expense.upsert({
    where: { id: "00000000-0000-0000-0000-000000000023" },
    update: { title: "Transport Supplier", amount: 120000, notes: "Biaya antar jemput barang", spentAt: new Date("2026-03-03T09:00:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000023",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: owner.id,
      title: "Transport Supplier",
      amount: 120000,
      notes: "Biaya antar jemput barang",
      spentAt: new Date("2026-03-03T09:00:00.000Z")
    }
  });

  await prisma.supportTicket.upsert({
    where: { id: "00000000-0000-0000-0000-000000000030" },
    update: { title: "Printer struk putus-putus", description: "Hasil cetak blur saat jam sibuk", priority: "high", status: "open" },
    create: {
      id: "00000000-0000-0000-0000-000000000030",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedBy: cashier.id,
      title: "Printer struk putus-putus",
      description: "Hasil cetak blur saat jam sibuk",
      priority: "high",
      status: "open"
    }
  });

  await prisma.supportTicket.upsert({
    where: { id: "00000000-0000-0000-0000-000000000031" },
    update: { title: "Barcode scanner lambat", description: "Perlu restart berkala supaya scan normal", priority: "normal", status: "resolved" },
    create: {
      id: "00000000-0000-0000-0000-000000000031",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedBy: manager.id,
      title: "Barcode scanner lambat",
      description: "Perlu restart berkala supaya scan normal",
      priority: "normal",
      status: "resolved"
    }
  });

  await prisma.supportTicket.upsert({
    where: { id: "00000000-0000-0000-0000-000000000032" },
    update: { title: "Aplikasi login timeout", description: "Kadang logout sendiri saat jam ramai", priority: "high", status: "in_progress" },
    create: {
      id: "00000000-0000-0000-0000-000000000032",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedBy: owner.id,
      title: "Aplikasi login timeout",
      description: "Kadang logout sendiri saat jam ramai",
      priority: "high",
      status: "in_progress"
    }
  });

  await prisma.cashierShift.upsert({
    where: { id: "00000000-0000-0000-0000-000000000070" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedByUserId: cashier.id,
      openingCash: 300000,
      status: "open",
      openedAt: new Date("2026-03-04T00:10:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000070",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedByUserId: cashier.id,
      openingCash: 300000,
      status: "open",
      openedAt: new Date("2026-03-04T00:10:00.000Z")
    }
  });

  await prisma.cashierShift.upsert({
    where: { id: "00000000-0000-0000-0000-000000000071" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedByUserId: manager.id,
      openingCash: 500000,
      closingCash: 750000,
      expectedCash: 740000,
      cashDifference: 10000,
      notes: "Selisih kecil dari pembulatan cash",
      status: "closed",
      openedAt: new Date("2026-03-02T00:00:00.000Z"),
      closedAt: new Date("2026-03-02T10:30:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000071",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      openedByUserId: manager.id,
      openingCash: 500000,
      closingCash: 750000,
      expectedCash: 740000,
      cashDifference: 10000,
      notes: "Selisih kecil dari pembulatan cash",
      status: "closed",
      openedAt: new Date("2026-03-02T00:00:00.000Z"),
      closedAt: new Date("2026-03-02T10:30:00.000Z")
    }
  });

  const purchaseA = await prisma.purchase.upsert({
    where: { id: "00000000-0000-0000-0000-000000000080" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      supplierId: supplierSatu.id,
      invoiceNumber: "INV-SUP-20260302-01",
      notes: "Restock mingguan",
      purchasedAt: new Date("2026-03-02T03:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000080",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      supplierId: supplierSatu.id,
      invoiceNumber: "INV-SUP-20260302-01",
      notes: "Restock mingguan",
      purchasedAt: new Date("2026-03-02T03:00:00.000Z")
    }
  });

  await prisma.purchaseItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000082" },
    update: { purchaseId: purchaseA.id, productId: productA.id, quantity: 30, unitCost: 4300, lineTotal: 129000 },
    create: {
      id: "00000000-0000-0000-0000-000000000082",
      purchaseId: purchaseA.id,
      productId: productA.id,
      quantity: 30,
      unitCost: 4300,
      lineTotal: 129000
    }
  });

  await prisma.purchaseItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000083" },
    update: { purchaseId: purchaseA.id, productId: productC.id, quantity: 20, unitCost: 13600, lineTotal: 272000 },
    create: {
      id: "00000000-0000-0000-0000-000000000083",
      purchaseId: purchaseA.id,
      productId: productC.id,
      quantity: 20,
      unitCost: 13600,
      lineTotal: 272000
    }
  });

  const purchaseB = await prisma.purchase.upsert({
    where: { id: "00000000-0000-0000-0000-000000000081" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: owner.id,
      supplierId: supplierDua.id,
      invoiceNumber: "INV-SUP-20260303-02",
      notes: "Top-up produk minuman",
      purchasedAt: new Date("2026-03-03T04:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000081",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: owner.id,
      supplierId: supplierDua.id,
      invoiceNumber: "INV-SUP-20260303-02",
      notes: "Top-up produk minuman",
      purchasedAt: new Date("2026-03-03T04:00:00.000Z")
    }
  });

  await prisma.purchaseItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000084" },
    update: { purchaseId: purchaseB.id, productId: productD.id, quantity: 24, unitCost: 14600, lineTotal: 350400 },
    create: {
      id: "00000000-0000-0000-0000-000000000084",
      purchaseId: purchaseB.id,
      productId: productD.id,
      quantity: 24,
      unitCost: 14600,
      lineTotal: 350400
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000055" },
    update: { storeId: storeA.id, productId: productA.id, type: "in", quantity: 30, reason: "purchase_restock", referenceId: purchaseA.id },
    create: {
      id: "00000000-0000-0000-0000-000000000055",
      storeId: storeA.id,
      productId: productA.id,
      type: "in",
      quantity: 30,
      reason: "purchase_restock",
      referenceId: purchaseA.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000056" },
    update: { storeId: storeA.id, productId: productC.id, type: "in", quantity: 20, reason: "purchase_restock", referenceId: purchaseA.id },
    create: {
      id: "00000000-0000-0000-0000-000000000056",
      storeId: storeA.id,
      productId: productC.id,
      type: "in",
      quantity: 20,
      reason: "purchase_restock",
      referenceId: purchaseA.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000057" },
    update: { storeId: storeA.id, productId: productD.id, type: "in", quantity: 24, reason: "purchase_restock", referenceId: purchaseB.id },
    create: {
      id: "00000000-0000-0000-0000-000000000057",
      storeId: storeA.id,
      productId: productD.id,
      type: "in",
      quantity: 24,
      reason: "purchase_restock",
      referenceId: purchaseB.id
    }
  });

  const saleA = await prisma.sale.upsert({
    where: { id: "00000000-0000-0000-0000-000000000040" },
    update: { paymentMethod: "cash", subtotal: 28000, discount: 1000, total: 27000, soldAt: new Date("2026-03-01T10:00:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000040",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      cashierUserId: cashier.id,
      idempotencyKey: "00000000-0000-0000-0000-000000000140",
      paymentMethod: "cash",
      subtotal: 28000,
      discount: 1000,
      total: 27000,
      soldAt: new Date("2026-03-01T10:00:00.000Z")
    }
  });

  const saleB = await prisma.sale.upsert({
    where: { id: "00000000-0000-0000-0000-000000000042" },
    update: { paymentMethod: "qris", subtotal: 50000, discount: 0, total: 50000, soldAt: new Date("2026-03-01T15:20:00.000Z") },
    create: {
      id: "00000000-0000-0000-0000-000000000042",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      cashierUserId: cashier.id,
      idempotencyKey: "00000000-0000-0000-0000-000000000142",
      paymentMethod: "qris",
      subtotal: 50000,
      discount: 0,
      total: 50000,
      soldAt: new Date("2026-03-01T15:20:00.000Z")
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000041" },
    update: { saleId: saleA.id, productId: productA.id, quantity: 2, unitPrice: 5000, lineTotal: 10000 },
    create: {
      id: "00000000-0000-0000-0000-000000000041",
      saleId: saleA.id,
      productId: productA.id,
      quantity: 2,
      unitPrice: 5000,
      lineTotal: 10000
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000043" },
    update: { saleId: saleA.id, productId: productLowStock.id, quantity: 1, unitPrice: 28000, lineTotal: 28000 },
    create: {
      id: "00000000-0000-0000-0000-000000000043",
      saleId: saleA.id,
      productId: productLowStock.id,
      quantity: 1,
      unitPrice: 28000,
      lineTotal: 28000
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000044" },
    update: { saleId: saleB.id, productId: productB.id, quantity: 2, unitPrice: 18000, lineTotal: 36000 },
    create: {
      id: "00000000-0000-0000-0000-000000000044",
      saleId: saleB.id,
      productId: productB.id,
      quantity: 2,
      unitPrice: 18000,
      lineTotal: 36000
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000045" },
    update: { saleId: saleB.id, productId: productA.id, quantity: 2, unitPrice: 7000, lineTotal: 14000 },
    create: {
      id: "00000000-0000-0000-0000-000000000045",
      saleId: saleB.id,
      productId: productA.id,
      quantity: 2,
      unitPrice: 7000,
      lineTotal: 14000
    }
  });

  const saleC = await prisma.sale.upsert({
    where: { id: "00000000-0000-0000-0000-000000000046" },
    update: {
      paymentMethod: "split",
      paymentDetails: { cash: 20000, qris: 25000, transfer: 0 },
      referenceNumber: "TRX-QR-20260303-001",
      paidAmount: 45000,
      changeAmount: 0,
      subtotal: 50000,
      discount: 3000,
      promoCode: "HAPPYHOUR10",
      promoDiscount: 2000,
      total: 45000,
      soldAt: new Date("2026-03-03T07:30:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000046",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      cashierUserId: cashier.id,
      idempotencyKey: "00000000-0000-0000-0000-000000000146",
      paymentMethod: "split",
      paymentDetails: { cash: 20000, qris: 25000, transfer: 0 },
      referenceNumber: "TRX-QR-20260303-001",
      paidAmount: 45000,
      changeAmount: 0,
      subtotal: 50000,
      discount: 3000,
      promoCode: "HAPPYHOUR10",
      promoDiscount: 2000,
      total: 45000,
      soldAt: new Date("2026-03-03T07:30:00.000Z")
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000047" },
    update: { saleId: saleC.id, productId: productD.id, quantity: 2, unitPrice: 17500, discount: 2000, lineTotal: 33000 },
    create: {
      id: "00000000-0000-0000-0000-000000000047",
      saleId: saleC.id,
      productId: productD.id,
      quantity: 2,
      unitPrice: 17500,
      discount: 2000,
      lineTotal: 33000
    }
  });

  await prisma.saleItem.upsert({
    where: { id: "00000000-0000-0000-0000-000000000048" },
    update: { saleId: saleC.id, productId: productC.id, quantity: 1, unitPrice: 16500, discount: 1000, lineTotal: 15500 },
    create: {
      id: "00000000-0000-0000-0000-000000000048",
      saleId: saleC.id,
      productId: productC.id,
      quantity: 1,
      unitPrice: 16500,
      discount: 1000,
      lineTotal: 15500
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000053" },
    update: { storeId: storeA.id, productId: productA.id, type: "sale", quantity: 2, reason: "sale_transaction", referenceId: saleA.id },
    create: {
      id: "00000000-0000-0000-0000-000000000053",
      storeId: storeA.id,
      productId: productA.id,
      type: "sale",
      quantity: 2,
      reason: "sale_transaction",
      referenceId: saleA.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000054" },
    update: { storeId: storeA.id, productId: productLowStock.id, type: "sale", quantity: 1, reason: "sale_transaction", referenceId: saleA.id },
    create: {
      id: "00000000-0000-0000-0000-000000000054",
      storeId: storeA.id,
      productId: productLowStock.id,
      type: "sale",
      quantity: 1,
      reason: "sale_transaction",
      referenceId: saleA.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000058" },
    update: { storeId: storeA.id, productId: productD.id, type: "sale", quantity: 2, reason: "sale_transaction", referenceId: saleC.id },
    create: {
      id: "00000000-0000-0000-0000-000000000058",
      storeId: storeA.id,
      productId: productD.id,
      type: "sale",
      quantity: 2,
      reason: "sale_transaction",
      referenceId: saleC.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000059" },
    update: { storeId: storeA.id, productId: productC.id, type: "sale", quantity: 1, reason: "sale_transaction", referenceId: saleC.id },
    create: {
      id: "00000000-0000-0000-0000-000000000059",
      storeId: storeA.id,
      productId: productC.id,
      type: "sale",
      quantity: 1,
      reason: "sale_transaction",
      referenceId: saleC.id
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000060" },
    update: { storeId: storeA.id, productId: productB.id, type: "adjustment", quantity: 79, reason: "sale_return_partial", referenceId: saleB.id },
    create: {
      id: "00000000-0000-0000-0000-000000000060",
      storeId: storeA.id,
      productId: productB.id,
      type: "adjustment",
      quantity: 79,
      reason: "sale_return_partial",
      referenceId: saleB.id
    }
  });

  const stockOpnameOpen = await prisma.stockOpnameSession.upsert({
    where: { id: "00000000-0000-0000-0000-000000000090" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: cashier.id,
      status: "open",
      notes: "Opname harian kasir"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000090",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: cashier.id,
      status: "open",
      notes: "Opname harian kasir"
    }
  });

  const stockOpnameSubmitted = await prisma.stockOpnameSession.upsert({
    where: { id: "00000000-0000-0000-0000-000000000091" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      status: "submitted",
      notes: "Opname mingguan siap approve"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000091",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      status: "submitted",
      notes: "Opname mingguan siap approve"
    }
  });

  const stockOpnameApproved = await prisma.stockOpnameSession.upsert({
    where: { id: "00000000-0000-0000-0000-000000000092" },
    update: {
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      approvedBy: owner.id,
      status: "approved",
      approvedAt: new Date("2026-03-03T12:00:00.000Z"),
      notes: "Opname bulanan approved owner"
    },
    create: {
      id: "00000000-0000-0000-0000-000000000092",
      tenantId: tenantMain.id,
      storeId: storeA.id,
      createdBy: manager.id,
      approvedBy: owner.id,
      status: "approved",
      approvedAt: new Date("2026-03-03T12:00:00.000Z"),
      notes: "Opname bulanan approved owner"
    }
  });

  await prisma.stockOpnameItem.upsert({
    where: { sessionId_productId: { sessionId: stockOpnameOpen.id, productId: productA.id } },
    update: { systemStock: 95, countedStock: 95, difference: 0 },
    create: {
      id: "00000000-0000-0000-0000-000000000093",
      sessionId: stockOpnameOpen.id,
      productId: productA.id,
      systemStock: 95,
      countedStock: 95,
      difference: 0
    }
  });

  await prisma.stockOpnameItem.upsert({
    where: { sessionId_productId: { sessionId: stockOpnameSubmitted.id, productId: productB.id } },
    update: { systemStock: 78, countedStock: 77, difference: -1 },
    create: {
      id: "00000000-0000-0000-0000-000000000094",
      sessionId: stockOpnameSubmitted.id,
      productId: productB.id,
      systemStock: 78,
      countedStock: 77,
      difference: -1
    }
  });

  await prisma.stockOpnameItem.upsert({
    where: { sessionId_productId: { sessionId: stockOpnameSubmitted.id, productId: productC.id } },
    update: { systemStock: 52, countedStock: 54, difference: 2 },
    create: {
      id: "00000000-0000-0000-0000-000000000095",
      sessionId: stockOpnameSubmitted.id,
      productId: productC.id,
      systemStock: 52,
      countedStock: 54,
      difference: 2
    }
  });

  await prisma.stockOpnameItem.upsert({
    where: { sessionId_productId: { sessionId: stockOpnameApproved.id, productId: productLowStock.id } },
    update: { systemStock: 4, countedStock: 6, difference: 2 },
    create: {
      id: "00000000-0000-0000-0000-000000000096",
      sessionId: stockOpnameApproved.id,
      productId: productLowStock.id,
      systemStock: 4,
      countedStock: 6,
      difference: 2
    }
  });

  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-0000-0000-000000000063" },
    update: {
      storeId: storeA.id,
      productId: productLowStock.id,
      type: "adjustment",
      quantity: 6,
      reason: "stock_opname_approved:00000000-0000-0000-0000-000000000092",
      referenceId: stockOpnameApproved.id
    },
    create: {
      id: "00000000-0000-0000-0000-000000000063",
      storeId: storeA.id,
      productId: productLowStock.id,
      type: "adjustment",
      quantity: 6,
      reason: "stock_opname_approved:00000000-0000-0000-0000-000000000092",
      referenceId: stockOpnameApproved.id
    }
  });

  const ownerRefreshHash = crypto.createHash("sha256").update("seed-owner-refresh-token").digest("hex");
  const managerRefreshHash = crypto.createHash("sha256").update("seed-manager-refresh-token").digest("hex");

  await prisma.refreshToken.deleteMany({
    where: {
      userId: {
        in: [owner.id, manager.id]
      }
    }
  });

  await prisma.refreshToken.upsert({
    where: { tokenHash: ownerRefreshHash },
    update: { userId: owner.id, expiresAt: new Date("2026-04-01T00:00:00.000Z"), revokedAt: null },
    create: {
      id: "00000000-0000-0000-0000-000000000060",
      userId: owner.id,
      tokenHash: ownerRefreshHash,
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
      revokedAt: null
    }
  });

  await prisma.refreshToken.upsert({
    where: { tokenHash: managerRefreshHash },
    update: {
      userId: manager.id,
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      revokedAt: new Date("2026-03-01T01:00:00.000Z")
    },
    create: {
      id: "00000000-0000-0000-0000-000000000061",
      userId: manager.id,
      tokenHash: managerRefreshHash,
      expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      revokedAt: new Date("2026-03-01T01:00:00.000Z")
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
