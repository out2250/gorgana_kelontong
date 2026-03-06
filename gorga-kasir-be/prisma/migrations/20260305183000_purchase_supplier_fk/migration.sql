-- AlterTable
ALTER TABLE `Purchase`
  ADD COLUMN `supplierId` VARCHAR(191) NULL;

-- Backfill missing supplier master from historical purchases
INSERT INTO `Supplier` (`id`, `tenantId`, `name`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  UUID() AS `id`,
  p.`tenantId`,
  p.`supplierName`,
  true,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Purchase` p
LEFT JOIN `Supplier` s
  ON s.`tenantId` = p.`tenantId`
  AND s.`name` = p.`supplierName`
WHERE s.`id` IS NULL
GROUP BY p.`tenantId`, p.`supplierName`;

-- Link purchase rows to supplier master
UPDATE `Purchase` p
JOIN `Supplier` s
  ON s.`tenantId` = p.`tenantId`
  AND s.`name` = p.`supplierName`
SET p.`supplierId` = s.`id`
WHERE p.`supplierId` IS NULL;

-- Enforce not-null and foreign key
ALTER TABLE `Purchase`
  MODIFY COLUMN `supplierId` VARCHAR(191) NOT NULL;

CREATE INDEX `Purchase_supplierId_idx` ON `Purchase`(`supplierId`);

ALTER TABLE `Purchase`
  ADD CONSTRAINT `Purchase_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove legacy free-text column
ALTER TABLE `Purchase`
  DROP COLUMN `supplierName`;
