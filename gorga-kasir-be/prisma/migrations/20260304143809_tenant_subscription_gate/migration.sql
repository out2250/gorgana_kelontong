/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `subscription` DROP FOREIGN KEY `Subscription_tenantId_fkey`;

-- DropIndex
DROP INDEX `Subscription_tenantId_status_idx` ON `subscription`;

-- AlterTable
ALTER TABLE `subscription` ADD COLUMN `paymentStatus` ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    ADD COLUMN `trialEnabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `tenant` ADD COLUMN `additionalData` JSON NULL,
    ADD COLUMN `address` VARCHAR(191) NULL,
    ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedBy` VARCHAR(191) NULL,
    ADD COLUMN `contactPhone` VARCHAR(191) NULL,
    ADD COLUMN `dateOfBirth` DATETIME(3) NULL,
    ADD COLUMN `fullName` VARCHAR(191) NULL,
    ADD COLUMN `rejectionReason` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('pending_approval', 'active', 'rejected', 'inactive') NOT NULL DEFAULT 'pending_approval';

-- AlterTable
ALTER TABLE `user` ADD COLUMN `address` VARCHAR(191) NULL,
    ADD COLUMN `jobResponsibility` VARCHAR(191) NULL,
    ADD COLUMN `phoneNumber` VARCHAR(191) NULL,
    ADD COLUMN `username` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Subscription_tenantId_status_paymentStatus_idx` ON `Subscription`(`tenantId`, `status`, `paymentStatus`);

-- CreateIndex
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
