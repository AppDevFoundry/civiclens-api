-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "enrichmentAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastEnrichedAt" TIMESTAMP(3);
