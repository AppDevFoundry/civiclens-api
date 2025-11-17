-- CreateTable
CREATE TABLE "UserDevice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "badgeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushNotificationPreference" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vibrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 20,
    "maxNotificationsPerHour" INTEGER NOT NULL DEFAULT 5,
    "billCriteria" JSONB,
    "memberCriteria" JSONB,
    "keywordCriteria" JSONB,
    "timingCriteria" JSONB,
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "totalNotificationsSent" INTEGER NOT NULL DEFAULT 0,
    "lastNotificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_deviceToken_key" ON "UserDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "UserDevice"("userId");

-- CreateIndex
CREATE INDEX "UserDevice_platform_idx" ON "UserDevice"("platform");

-- CreateIndex
CREATE INDEX "UserDevice_isActive_idx" ON "UserDevice"("isActive");

-- CreateIndex
CREATE INDEX "UserDevice_lastActiveAt_idx" ON "UserDevice"("lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushNotificationPreference_userId_key" ON "PushNotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushNotificationPreference_unsubscribeToken_key" ON "PushNotificationPreference"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "PushNotificationPreference_pushEnabled_idx" ON "PushNotificationPreference"("pushEnabled");

-- CreateIndex
CREATE INDEX "PushNotificationPreference_userId_idx" ON "PushNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "PushNotificationPreference_unsubscribeToken_idx" ON "PushNotificationPreference"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotificationPreference" ADD CONSTRAINT "PushNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
