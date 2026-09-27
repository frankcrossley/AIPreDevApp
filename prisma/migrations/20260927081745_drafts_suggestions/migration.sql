-- AlterTable
ALTER TABLE "HatNote" ADD COLUMN "moveToId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Draft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT,
    "targetId" TEXT,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "excerptId" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "triagedBy" TEXT,
    "triagedAt" DATETIME,
    "resultBlockId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "section" TEXT,
    "op" TEXT,
    "blockId" TEXT,
    "afterBlockId" TEXT,
    "itemType" TEXT,
    "hatNoteId" TEXT
);
INSERT INTO "new_Draft" ("authorId", "createdAt", "excerptId", "expiresAt", "id", "resultBlockId", "sourceId", "status", "targetId", "targetType", "text", "triagedAt", "triagedBy") SELECT "authorId", "createdAt", "excerptId", "expiresAt", "id", "resultBlockId", "sourceId", "status", "targetId", "targetType", "text", "triagedAt", "triagedBy" FROM "Draft";
DROP TABLE "Draft";
ALTER TABLE "new_Draft" RENAME TO "Draft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
