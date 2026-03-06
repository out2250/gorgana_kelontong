-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mfaSecret` VARCHAR(191) NULL,
  ADD COLUMN `mfaTempSecret` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `LoginChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `fulfilledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `LoginChallenge_userId_expiresAt_idx`(`userId`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LoginChallenge`
  ADD CONSTRAINT `LoginChallenge_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
