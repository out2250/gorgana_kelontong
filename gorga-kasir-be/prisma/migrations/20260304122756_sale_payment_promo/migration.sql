-- AlterTable
ALTER TABLE `sale` ADD COLUMN `changeAmount` DECIMAL(65, 30) NULL,
    ADD COLUMN `paidAmount` DECIMAL(65, 30) NULL,
    ADD COLUMN `paymentDetails` JSON NULL,
    ADD COLUMN `promoCode` VARCHAR(191) NULL,
    ADD COLUMN `promoDiscount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    ADD COLUMN `referenceNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `saleitem` ADD COLUMN `discount` DECIMAL(65, 30) NOT NULL DEFAULT 0;
