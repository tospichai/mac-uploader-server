-- CreateTable
CREATE TABLE `photographers` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NULL,
    `logo_url` VARCHAR(191) NULL,
    `facebook_url` VARCHAR(191) NULL,
    `instagram_url` VARCHAR(191) NULL,
    `twitter_url` VARCHAR(191) NULL,
    `website_url` VARCHAR(191) NULL,
    `api_key` VARCHAR(191) NULL,
    `storage_quota_mb` INTEGER NOT NULL DEFAULT 1000,
    `storage_used_mb` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `photographers_username_key`(`username`),
    UNIQUE INDEX `photographers_email_key`(`email`),
    UNIQUE INDEX `photographers_api_key_key`(`api_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(191) NOT NULL,
    `photographer_id` VARCHAR(191) NOT NULL,
    `event_date` DATETIME(3) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `folder_name` VARCHAR(191) NOT NULL,
    `default_language` VARCHAR(191) NOT NULL DEFAULT 'th',
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `slug` VARCHAR(191) NOT NULL,
    `photo_count` INTEGER NOT NULL DEFAULT 0,
    `total_size_mb` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `events_slug_key`(`slug`),
    UNIQUE INDEX `events_photographer_id_folder_name_key`(`photographer_id`, `folder_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `photos` (
    `id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `photographer_id` VARCHAR(191) NOT NULL,
    `original_filename` VARCHAR(191) NOT NULL,
    `original_path` VARCHAR(191) NOT NULL,
    `thumbnail_path` VARCHAR(191) NOT NULL,
    `file_size_bytes` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `format` VARCHAR(191) NULL,
    `checksum` VARCHAR(191) NULL,
    `shot_at` DATETIME(3) NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `photos_event_id_fkey`(`event_id`),
    INDEX `photos_photographer_id_fkey`(`photographer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_usage` (
    `id` VARCHAR(191) NOT NULL,
    `photographer_id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `request_count` INTEGER NOT NULL DEFAULT 0,
    `bytes_transferred` INTEGER NOT NULL DEFAULT 0,
    `date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `api_usage_photographer_id_endpoint_date_key`(`photographer_id`, `endpoint`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_photographer_id_fkey` FOREIGN KEY (`photographer_id`) REFERENCES `photographers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `photos` ADD CONSTRAINT `photos_photographer_id_fkey` FOREIGN KEY (`photographer_id`) REFERENCES `photographers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_usage` ADD CONSTRAINT `api_usage_photographer_id_fkey` FOREIGN KEY (`photographer_id`) REFERENCES `photographers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

