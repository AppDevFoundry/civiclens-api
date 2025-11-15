-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "lastChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "syncAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" SERIAL NOT NULL,
    "resourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsFetched" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "errorsEncountered" JSONB,
    "cursor" JSONB,
    "metadata" JSONB,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" SERIAL NOT NULL,
    "jobType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillChangeLog" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BillChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWatchlist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "billId" INTEGER,
    "memberId" INTEGER,
    "topicKeyword" TEXT,
    "notifyOnStatus" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnActions" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnCosponsors" BOOLEAN NOT NULL DEFAULT false,
    "digestMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "UserWatchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSummary" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "plainLanguageSummary" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "stakeholders" JSONB,
    "controversy" TEXT,
    "complexityScore" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "cost" DOUBLE PRECISION,

    CONSTRAINT "BillSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillRelationship" (
    "id" SERIAL NOT NULL,
    "sourceBillId" INTEGER NOT NULL,
    "targetBillId" INTEGER NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'congress_api',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_resourceType_startedAt_idx" ON "SyncRun"("resourceType", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_status_startedAt_idx" ON "SyncRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_scheduledFor_priority_idx" ON "SyncJob"("status", "scheduledFor", "priority");

-- CreateIndex
CREATE INDEX "SyncJob_jobType_status_idx" ON "SyncJob"("jobType", "status");

-- CreateIndex
CREATE INDEX "SyncJob_createdAt_idx" ON "SyncJob"("createdAt");

-- CreateIndex
CREATE INDEX "BillChangeLog_billId_detectedAt_idx" ON "BillChangeLog"("billId", "detectedAt");

-- CreateIndex
CREATE INDEX "BillChangeLog_notified_detectedAt_idx" ON "BillChangeLog"("notified", "detectedAt");

-- CreateIndex
CREATE INDEX "BillChangeLog_changeType_detectedAt_idx" ON "BillChangeLog"("changeType", "detectedAt");

-- CreateIndex
CREATE INDEX "UserWatchlist_userId_topicKeyword_idx" ON "UserWatchlist"("userId", "topicKeyword");

-- CreateIndex
CREATE INDEX "UserWatchlist_billId_idx" ON "UserWatchlist"("billId");

-- CreateIndex
CREATE INDEX "UserWatchlist_memberId_idx" ON "UserWatchlist"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWatchlist_userId_billId_key" ON "UserWatchlist"("userId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWatchlist_userId_memberId_key" ON "UserWatchlist"("userId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "BillSummary_billId_key" ON "BillSummary"("billId");

-- CreateIndex
CREATE INDEX "BillSummary_generatedAt_idx" ON "BillSummary"("generatedAt");

-- CreateIndex
CREATE INDEX "BillSummary_complexityScore_idx" ON "BillSummary"("complexityScore");

-- CreateIndex
CREATE INDEX "BillRelationship_sourceBillId_idx" ON "BillRelationship"("sourceBillId");

-- CreateIndex
CREATE INDEX "BillRelationship_targetBillId_idx" ON "BillRelationship"("targetBillId");

-- CreateIndex
CREATE INDEX "BillRelationship_relationshipType_idx" ON "BillRelationship"("relationshipType");

-- CreateIndex
CREATE UNIQUE INDEX "BillRelationship_sourceBillId_targetBillId_relationshipType_key" ON "BillRelationship"("sourceBillId", "targetBillId", "relationshipType");

-- CreateIndex
CREATE INDEX "Bill_lastSyncedAt_idx" ON "Bill"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "Bill_priority_idx" ON "Bill"("priority");

-- AddForeignKey
ALTER TABLE "BillChangeLog" ADD CONSTRAINT "BillChangeLog_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWatchlist" ADD CONSTRAINT "UserWatchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWatchlist" ADD CONSTRAINT "UserWatchlist_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWatchlist" ADD CONSTRAINT "UserWatchlist_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSummary" ADD CONSTRAINT "BillSummary_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRelationship" ADD CONSTRAINT "BillRelationship_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRelationship" ADD CONSTRAINT "BillRelationship_targetBillId_fkey" FOREIGN KEY ("targetBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
