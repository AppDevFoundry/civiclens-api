-- CreateTable
CREATE TABLE "SyncError" (
    "id" SERIAL NOT NULL,
    "errorType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "context" JSONB,
    "shouldAlert" BOOLEAN NOT NULL DEFAULT false,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "alertedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncError_errorType_idx" ON "SyncError"("errorType");

-- CreateIndex
CREATE INDEX "SyncError_severity_idx" ON "SyncError"("severity");

-- CreateIndex
CREATE INDEX "SyncError_createdAt_idx" ON "SyncError"("createdAt");

-- CreateIndex
CREATE INDEX "SyncError_shouldAlert_alerted_idx" ON "SyncError"("shouldAlert", "alerted");
