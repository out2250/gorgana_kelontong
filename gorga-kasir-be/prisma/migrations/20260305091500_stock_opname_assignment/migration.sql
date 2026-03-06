ALTER TABLE `stockopnamesession`
  ADD COLUMN `assignedTo` VARCHAR(191) NULL,
  ADD COLUMN `assignedBy` VARCHAR(191) NULL,
  ADD COLUMN `assignedAt` DATETIME(3) NULL,
  ADD CONSTRAINT `stockopnamesession_assignedTo_fkey`
    FOREIGN KEY (`assignedTo`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `stockopnamesession_assignedBy_fkey`
    FOREIGN KEY (`assignedBy`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;