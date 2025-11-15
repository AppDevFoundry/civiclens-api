-- CreateTable
CREATE TABLE "UserNotificationPreferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailAddress" TEXT,
    "digestFrequency" TEXT NOT NULL DEFAULT 'daily',
    "digestTime" TEXT NOT NULL DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "notificationType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "billId" INTEGER,
    "memberId" INTEGER,
    "changeLogId" INTEGER,
    "deliveryMethod" TEXT NOT NULL DEFAULT 'email',
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreferences_userId_key" ON "UserNotificationPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreferences_unsubscribeToken_key" ON "UserNotificationPreferences"("unsubscribeToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreferences_emailVerificationToken_key" ON "UserNotificationPreferences"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "UserNotificationPreferences_emailEnabled_idx" ON "UserNotificationPreferences"("emailEnabled");

-- CreateIndex
CREATE INDEX "UserNotificationPreferences_unsubscribeToken_idx" ON "UserNotificationPreferences"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "NotificationHistory_userId_createdAt_idx" ON "NotificationHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationHistory_status_idx" ON "NotificationHistory"("status");

-- CreateIndex
CREATE INDEX "NotificationHistory_notificationType_idx" ON "NotificationHistory"("notificationType");

-- CreateIndex
CREATE INDEX "NotificationHistory_billId_idx" ON "NotificationHistory"("billId");

-- AddForeignKey
ALTER TABLE "UserNotificationPreferences" ADD CONSTRAINT "UserNotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationHistory" ADD CONSTRAINT "NotificationHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
