-- CreateTable
CREATE TABLE `StockOpnameSession` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `status` ENUM('open', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'open',
    `notes` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockOpnameSession_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `StockOpnameSession_storeId_status_createdAt_idx`(`storeId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockOpnameItem` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `systemStock` INTEGER NOT NULL,
    `countedStock` INTEGER NOT NULL,
    `difference` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockOpnameItem_productId_idx`(`productId`),
    UNIQUE INDEX `StockOpnameItem_sessionId_productId_key`(`sessionId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockOpnameSession` ADD CONSTRAINT `StockOpnameSession_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpnameSession` ADD CONSTRAINT `StockOpnameSession_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpnameSession` ADD CONSTRAINT `StockOpnameSession_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpnameSession` ADD CONSTRAINT `StockOpnameSession_approvedBy_fkey` FOREIGN KEY (`approvedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpnameItem` ADD CONSTRAINT `StockOpnameItem_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `StockOpnameSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockOpnameItem` ADD CONSTRAINT `StockOpnameItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
