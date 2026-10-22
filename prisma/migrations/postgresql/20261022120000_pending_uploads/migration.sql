-- CreateTable
CREATE TABLE "pending_uploads" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_uploads_key_key" ON "pending_uploads"("key");

-- CreateIndex
CREATE INDEX "pending_uploads_expires_at_idx" ON "pending_uploads"("expires_at");
