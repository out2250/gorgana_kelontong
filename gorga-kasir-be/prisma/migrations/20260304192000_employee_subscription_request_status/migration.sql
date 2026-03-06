ALTER TABLE `Subscription`
  ADD COLUMN `requestStatus` ENUM('approve', 'refund', 'force_inactive', 'rejected') NULL;

ALTER TABLE `User`
  ADD COLUMN `conditionStatus` ENUM('on_duty', 'on_leave', 'sick', 'on_penalty') NOT NULL DEFAULT 'on_duty',
  ADD COLUMN `attendanceStatus` ENUM('present', 'absent', 'late', 'off') NOT NULL DEFAULT 'off',
  ADD COLUMN `scheduleLabel` VARCHAR(191) NULL,
  ADD COLUMN `scheduleStartTime` VARCHAR(191) NULL,
  ADD COLUMN `scheduleEndTime` VARCHAR(191) NULL;
