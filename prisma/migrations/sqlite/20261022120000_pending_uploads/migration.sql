-- CreateTable
CREATE TABLE "pending_uploads" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_uploads_key_key" ON "pending_uploads"("key");

-- CreateIndex
CREATE INDEX "pending_uploads_expires_at_idx" ON "pending_uploads"("expires_at");
