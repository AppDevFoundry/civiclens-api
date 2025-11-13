-- AlterTable
ALTER TABLE "_ArticleToTag" ADD CONSTRAINT "_ArticleToTag_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ArticleToTag_AB_unique";

-- AlterTable
ALTER TABLE "_UserFavorites" ADD CONSTRAINT "_UserFavorites_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserFavorites_AB_unique";

-- AlterTable
ALTER TABLE "_UserFollows" ADD CONSTRAINT "_UserFollows_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_UserFollows_AB_unique";

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "congress" INTEGER NOT NULL,
    "billType" TEXT NOT NULL,
    "billNumber" INTEGER NOT NULL,
    "title" TEXT,
    "originChamber" TEXT,
    "originChamberCode" TEXT,
    "updateDate" TIMESTAMP(3),
    "updateDateIncludingText" TIMESTAMP(3),
    "introducedDate" TIMESTAMP(3),
    "latestActionDate" TIMESTAMP(3),
    "latestActionText" TEXT,
    "policyArea" TEXT,
    "constitutionalAuthorityStatementText" TEXT,
    "sponsorBioguideId" TEXT,
    "sponsorFirstName" TEXT,
    "sponsorLastName" TEXT,
    "sponsorFullName" TEXT,
    "sponsorState" TEXT,
    "sponsorParty" TEXT,
    "lawNumber" TEXT,
    "isLaw" BOOLEAN NOT NULL DEFAULT false,
    "congressGovUrl" TEXT,
    "apiResponseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "bioguideId" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "nickName" TEXT,
    "suffix" TEXT,
    "state" TEXT,
    "district" INTEGER,
    "party" TEXT,
    "partyName" TEXT,
    "chamber" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "officialWebsiteUrl" TEXT,
    "imageUrl" TEXT,
    "birthYear" INTEGER,
    "terms" JSONB,
    "apiResponseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" SERIAL NOT NULL,
    "systemCode" TEXT NOT NULL,
    "committeeCode" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "chamber" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "parentSystemCode" TEXT,
    "subcommittees" JSONB,
    "congressGovUrl" TEXT,
    "apiResponseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Committee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomination" (
    "id" SERIAL NOT NULL,
    "congress" INTEGER NOT NULL,
    "nominationNumber" TEXT NOT NULL,
    "partNumber" TEXT,
    "citation" TEXT,
    "description" TEXT,
    "organization" TEXT,
    "latestActionDate" TIMESTAMP(3),
    "latestActionText" TEXT,
    "receivedDate" TIMESTAMP(3),
    "congressGovUrl" TEXT,
    "apiResponseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" SERIAL NOT NULL,
    "congress" INTEGER NOT NULL,
    "chamber" TEXT NOT NULL,
    "jacketNumber" TEXT,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "location" TEXT,
    "committeeCode" TEXT,
    "committeeSystemCode" TEXT,
    "congressGovUrl" TEXT,
    "apiResponseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bill_congress_billType_idx" ON "Bill"("congress", "billType");

-- CreateIndex
CREATE INDEX "Bill_sponsorBioguideId_idx" ON "Bill"("sponsorBioguideId");

-- CreateIndex
CREATE INDEX "Bill_updateDate_idx" ON "Bill"("updateDate");

-- CreateIndex
CREATE INDEX "Bill_introducedDate_idx" ON "Bill"("introducedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_congress_billType_billNumber_key" ON "Bill"("congress", "billType", "billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_bioguideId_key" ON "Member"("bioguideId");

-- CreateIndex
CREATE INDEX "Member_state_idx" ON "Member"("state");

-- CreateIndex
CREATE INDEX "Member_party_idx" ON "Member"("party");

-- CreateIndex
CREATE INDEX "Member_chamber_idx" ON "Member"("chamber");

-- CreateIndex
CREATE INDEX "Member_isCurrent_idx" ON "Member"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Committee_systemCode_key" ON "Committee"("systemCode");

-- CreateIndex
CREATE INDEX "Committee_chamber_idx" ON "Committee"("chamber");

-- CreateIndex
CREATE INDEX "Committee_isCurrent_idx" ON "Committee"("isCurrent");

-- CreateIndex
CREATE INDEX "Committee_parentSystemCode_idx" ON "Committee"("parentSystemCode");

-- CreateIndex
CREATE INDEX "Nomination_congress_idx" ON "Nomination"("congress");

-- CreateIndex
CREATE INDEX "Nomination_organization_idx" ON "Nomination"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "Nomination_congress_nominationNumber_key" ON "Nomination"("congress", "nominationNumber");

-- CreateIndex
CREATE INDEX "Hearing_congress_idx" ON "Hearing"("congress");

-- CreateIndex
CREATE INDEX "Hearing_chamber_idx" ON "Hearing"("chamber");

-- CreateIndex
CREATE INDEX "Hearing_date_idx" ON "Hearing"("date");

-- CreateIndex
CREATE INDEX "Hearing_committeeSystemCode_idx" ON "Hearing"("committeeSystemCode");

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_committeeSystemCode_fkey" FOREIGN KEY ("committeeSystemCode") REFERENCES "Committee"("systemCode") ON DELETE SET NULL ON UPDATE CASCADE;
