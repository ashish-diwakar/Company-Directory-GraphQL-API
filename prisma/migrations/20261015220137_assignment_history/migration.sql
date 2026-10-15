-- CreateTable
CREATE TABLE "AssignmentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "equipmentModel" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "fromEmployeeId" TEXT,
    "fromEmployeeName" TEXT,
    "toEmployeeId" TEXT,
    "toEmployeeName" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AssignmentEvent_equipmentId_createdAt_idx" ON "AssignmentEvent"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentEvent_createdAt_idx" ON "AssignmentEvent"("createdAt");
