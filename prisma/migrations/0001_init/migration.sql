-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sectionsJson" TEXT NOT NULL,
    "requiredSectionsJson" TEXT NOT NULL,
    "teamCheckKeysJson" TEXT NOT NULL,
    "requiresPrfaq" BOOLEAN NOT NULL,
    "draftExpiryDays" INTEGER NOT NULL,
    "silenceRule" TEXT NOT NULL,
    "disagreementRule" TEXT NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "deciderId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "memberIdsJson" TEXT NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "promiseId" TEXT,
    "estimate" INTEGER,
    "hasUiChange" BOOLEAN NOT NULL DEFAULT false,
    "mockUri" TEXT,
    "jiraKey" TEXT,
    "sprint" TEXT,
    "signedOffBy" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "parentType" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "parentType" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "blockId" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerId" TEXT,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "requiredStanceIdsJson" TEXT NOT NULL,
    "stanceRound" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "round" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "uri" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Excerpt" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'quote',
    "note" TEXT,

    CONSTRAINT "Excerpt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "excerptId" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "triagedBy" TEXT,
    "triagedAt" TIMESTAMP(3),
    "resultBlockId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "section" TEXT,
    "op" TEXT,
    "blockId" TEXT,
    "afterBlockId" TEXT,
    "itemType" TEXT,
    "hatNoteId" TEXT,
    "baseText" TEXT,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HatNote" (
    "id" TEXT NOT NULL,
    "hat" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "refsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "moveToId" TEXT,

    CONSTRAINT "HatNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "hat" TEXT,
    "confirmedBy" TEXT,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prfaq" (
    "id" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subhead" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "whatChanges" TEXT NOT NULL,
    "customerQuoteExcerptId" TEXT,
    "successMeasure" TEXT,
    "state" TEXT NOT NULL,

    CONSTRAINT "Prfaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrfaqPromise" (
    "id" TEXT NOT NULL,
    "prfaqId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "PrfaqPromise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL,
    "prfaqId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "storyIdsJson" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "evidenceExcerptId" TEXT,

    CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadBack" (
    "id" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadBack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lengthMinutes" INTEGER NOT NULL,
    "attendeeIdsJson" TEXT NOT NULL,
    "agendaJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "captureText" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Epic_key_key" ON "Epic"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Story_key_key" ON "Story"("key");

-- CreateIndex
CREATE INDEX "Block_parentType_parentId_idx" ON "Block"("parentType", "parentId");

-- CreateIndex
CREATE INDEX "Item_parentType_parentId_idx" ON "Item"("parentType", "parentId");

-- CreateIndex
CREATE INDEX "Stance_itemId_idx" ON "Stance"("itemId");

-- CreateIndex
CREATE INDEX "Citation_fromType_fromId_idx" ON "Citation"("fromType", "fromId");

-- CreateIndex
CREATE UNIQUE INDEX "Prfaq_epicId_key" ON "Prfaq"("epicId");
