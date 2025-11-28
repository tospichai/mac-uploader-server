-- CreateTable
CREATE TABLE "photographers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "display_name" TEXT,
    "logo_url" TEXT,
    "facebook_url" TEXT,
    "instagram_url" TEXT,
    "twitter_url" TEXT,
    "website_url" TEXT,
    "api_key" TEXT,
    "storage_quota_mb" INTEGER NOT NULL DEFAULT 1000,
    "storage_used_mb" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "photographers_username_key" ON "photographers"("username");

-- CreateIndex
CREATE UNIQUE INDEX "photographers_email_key" ON "photographers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "photographers_api_key_key" ON "photographers"("api_key");
