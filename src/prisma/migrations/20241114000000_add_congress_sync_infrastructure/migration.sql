-- Clear sponsor references before adding foreign key (will be repopulated by sync)
UPDATE "Bill" SET "sponsorBioguideId" = NULL;

-- AlterTable: Add new columns to Bill
ALTER TABLE "Bill" ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "textUrl" TEXT,
ADD COLUMN     "xmlUrl" TEXT;

-- Data Migration: Populate slug for existing bills
UPDATE "Bill" SET "slug" = "congress" || '-' || "billType" || '-' || "billNumber" WHERE "slug" IS NULL;

-- CreateTable
CREATE TABLE "BillAction" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "actionCode" TEXT,
    "actionDate" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT,
    "actionTime" TEXT,
    "chamber" TEXT,
    "sourceSystemCode" INTEGER,
    "sourceSystemName" TEXT,
    "committees" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSubject" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isPolicyArea" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillCosponsor" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "isPrimarySponsor" BOOLEAN NOT NULL DEFAULT false,
    "cosponsorDate" TIMESTAMP(3),
    "isOriginalCosponsor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillCosponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillRelated" (
    "id" SERIAL NOT NULL,
    "fromBillId" INTEGER NOT NULL,
    "toBillId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillRelated_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillSummary" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "versionCode" TEXT NOT NULL,
    "actionDate" TIMESTAMP(3),
    "actionDesc" TEXT,
    "text" TEXT NOT NULL,
    "updateDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillTextVersion" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "txtUrl" TEXT,
    "xmlUrl" TEXT,
    "htmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillTextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillInsight" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "insightType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" SERIAL NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cursor" TEXT,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "apiRequestsMade" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorDetails" JSONB,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subscriptionType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "channels" TEXT[],
    "frequency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "eventData" JSONB NOT NULL,
    "matchableValues" TEXT[],
    "eventHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillAction_billId_actionDate_idx" ON "BillAction"("billId", "actionDate" DESC);

-- CreateIndex
CREATE INDEX "BillAction_actionCode_idx" ON "BillAction"("actionCode");

-- CreateIndex
CREATE INDEX "BillAction_chamber_idx" ON "BillAction"("chamber");

-- CreateIndex
CREATE UNIQUE INDEX "BillAction_billId_actionDate_actionCode_key" ON "BillAction"("billId", "actionDate", "actionCode");

-- CreateIndex
CREATE INDEX "BillSubject_billId_idx" ON "BillSubject"("billId");

-- CreateIndex
CREATE INDEX "BillSubject_name_idx" ON "BillSubject"("name");

-- CreateIndex
CREATE INDEX "BillSubject_isPolicyArea_idx" ON "BillSubject"("isPolicyArea");

-- CreateIndex
CREATE UNIQUE INDEX "BillSubject_billId_name_key" ON "BillSubject"("billId", "name");

-- CreateIndex
CREATE INDEX "BillCosponsor_billId_idx" ON "BillCosponsor"("billId");

-- CreateIndex
CREATE INDEX "BillCosponsor_memberId_idx" ON "BillCosponsor"("memberId");

-- CreateIndex
CREATE INDEX "BillCosponsor_isPrimarySponsor_idx" ON "BillCosponsor"("isPrimarySponsor");

-- CreateIndex
CREATE UNIQUE INDEX "BillCosponsor_billId_memberId_key" ON "BillCosponsor"("billId", "memberId");

-- CreateIndex
CREATE INDEX "BillRelated_fromBillId_idx" ON "BillRelated"("fromBillId");

-- CreateIndex
CREATE INDEX "BillRelated_toBillId_idx" ON "BillRelated"("toBillId");

-- CreateIndex
CREATE UNIQUE INDEX "BillRelated_fromBillId_toBillId_relationType_key" ON "BillRelated"("fromBillId", "toBillId", "relationType");

-- CreateIndex
CREATE INDEX "BillSummary_billId_idx" ON "BillSummary"("billId");

-- CreateIndex
CREATE INDEX "BillSummary_actionDate_idx" ON "BillSummary"("actionDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillSummary_billId_versionCode_key" ON "BillSummary"("billId", "versionCode");

-- CreateIndex
CREATE INDEX "BillTextVersion_billId_idx" ON "BillTextVersion"("billId");

-- CreateIndex
CREATE INDEX "BillTextVersion_date_idx" ON "BillTextVersion"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BillTextVersion_billId_type_date_key" ON "BillTextVersion"("billId", "type", "date");

-- CreateIndex
CREATE INDEX "BillInsight_billId_idx" ON "BillInsight"("billId");

-- CreateIndex
CREATE INDEX "BillInsight_insightType_idx" ON "BillInsight"("insightType");

-- CreateIndex
CREATE INDEX "BillInsight_updatedAt_idx" ON "BillInsight"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillInsight_billId_insightType_key" ON "BillInsight"("billId", "insightType");

-- CreateIndex
CREATE INDEX "SyncJob_jobType_idx" ON "SyncJob"("jobType");

-- CreateIndex
CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");

-- CreateIndex
CREATE INDEX "SyncJob_startedAt_idx" ON "SyncJob"("startedAt");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_idx" ON "UserSubscription"("userId");

-- CreateIndex
CREATE INDEX "UserSubscription_subscriptionType_idx" ON "UserSubscription"("subscriptionType");

-- CreateIndex
CREATE INDEX "UserSubscription_targetValue_idx" ON "UserSubscription"("targetValue");

-- CreateIndex
CREATE INDEX "UserSubscription_isActive_idx" ON "UserSubscription"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_subscriptionType_targetValue_key" ON "UserSubscription"("userId", "subscriptionType", "targetValue");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_eventHash_key" ON "NotificationEvent"("eventHash");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_idx" ON "NotificationEvent"("eventType");

-- CreateIndex
CREATE INDEX "NotificationEvent_sourceType_sourceId_idx" ON "NotificationEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_matchableValues_idx" ON "NotificationEvent"("matchableValues");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_idx" ON "NotificationDelivery"("userId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_scheduledFor_idx" ON "NotificationDelivery"("scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_idx" ON "NotificationDelivery"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_eventId_subscriptionId_channel_key" ON "NotificationDelivery"("eventId", "subscriptionId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_slug_key" ON "Bill"("slug");

-- CreateIndex
CREATE INDEX "Bill_policyArea_idx" ON "Bill"("policyArea");

-- CreateIndex
CREATE INDEX "Bill_isLaw_idx" ON "Bill"("isLaw");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_sponsorBioguideId_fkey" FOREIGN KEY ("sponsorBioguideId") REFERENCES "Member"("bioguideId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillAction" ADD CONSTRAINT "BillAction_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSubject" ADD CONSTRAINT "BillSubject_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCosponsor" ADD CONSTRAINT "BillCosponsor_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCosponsor" ADD CONSTRAINT "BillCosponsor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRelated" ADD CONSTRAINT "BillRelated_fromBillId_fkey" FOREIGN KEY ("fromBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRelated" ADD CONSTRAINT "BillRelated_toBillId_fkey" FOREIGN KEY ("toBillId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSummary" ADD CONSTRAINT "BillSummary_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillTextVersion" ADD CONSTRAINT "BillTextVersion_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillInsight" ADD CONSTRAINT "BillInsight_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
