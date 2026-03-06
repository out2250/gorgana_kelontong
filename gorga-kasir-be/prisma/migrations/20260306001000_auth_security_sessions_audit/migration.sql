-- AlterTable
ALTER TABLE `RefreshToken`
  ADD COLUMN `deviceId` VARCHAR(191) NULL,
  ADD COLUMN `userAgent` VARCHAR(512) NULL,
  ADD COLUMN `ipAddress` VARCHAR(64) NULL,
  ADD COLUMN `lastUsedAt` DATETIME(3) NULL;

CREATE INDEX `RefreshToken_userId_deviceId_revokedAt_idx` ON `RefreshToken`(`userId`, `deviceId`, `revokedAt`);

-- CreateTable
CREATE TABLE `LoginAttempt` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `email` VARCHAR(191) NOT NULL,
  `ipAddress` VARCHAR(191) NOT NULL,
  `userAgent` VARCHAR(512) NULL,
  `isSuccess` BOOLEAN NOT NULL DEFAULT false,
  `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `LoginAttempt_email_ipAddress_attemptedAt_idx`(`email`, `ipAddress`, `attemptedAt`),
  INDEX `LoginAttempt_userId_attemptedAt_idx`(`userId`, `attemptedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NULL,
  `actorUserId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `beforeData` JSON NULL,
  `afterData` JSON NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AuditLog_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
  INDEX `AuditLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LoginAttempt`
  ADD CONSTRAINT `LoginAttempt_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_actorUserId_fkey`
  FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
