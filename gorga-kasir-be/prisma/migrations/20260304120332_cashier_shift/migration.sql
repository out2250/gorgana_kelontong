-- CreateTable
CREATE TABLE `CashierShift` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `openedByUserId` VARCHAR(191) NOT NULL,
    `openingCash` DECIMAL(65, 30) NOT NULL,
    `closingCash` DECIMAL(65, 30) NULL,
    `expectedCash` DECIMAL(65, 30) NULL,
    `cashDifference` DECIMAL(65, 30) NULL,
    `notes` VARCHAR(191) NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CashierShift_tenantId_storeId_status_idx`(`tenantId`, `storeId`, `status`),
    INDEX `CashierShift_openedByUserId_status_idx`(`openedByUserId`, `status`),
    INDEX `CashierShift_storeId_openedAt_idx`(`storeId`, `openedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CashierShift` ADD CONSTRAINT `CashierShift_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashierShift` ADD CONSTRAINT `CashierShift_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashierShift` ADD CONSTRAINT `CashierShift_openedByUserId_fkey` FOREIGN KEY (`openedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
