-- Money transfer admin: REFUNDED status + support cases
ALTER TYPE "MoneyTransferStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

CREATE TYPE "MoneyTransferCaseType" AS ENUM (
  'REFUND_REQUEST',
  'DISPUTE',
  'PAYOUT_ISSUE',
  'FRAUD_REVIEW',
  'MANUAL_REVIEW',
  'OTHER'
);

CREATE TABLE "money_transfer_cases" (
  "id" TEXT NOT NULL,
  "ticketNumber" TEXT NOT NULL,
  "transferId" TEXT,
  "type" "MoneyTransferCaseType" NOT NULL DEFAULT 'OTHER',
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "resolution" TEXT,
  "assignedToId" TEXT,
  "openedById" TEXT NOT NULL,
  "requesterId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "money_transfer_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "money_transfer_case_notes" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "money_transfer_case_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "money_transfer_cases_ticketNumber_key" ON "money_transfer_cases"("ticketNumber");
CREATE INDEX "money_transfer_cases_transferId_idx" ON "money_transfer_cases"("transferId");
CREATE INDEX "money_transfer_cases_status_idx" ON "money_transfer_cases"("status");
CREATE INDEX "money_transfer_cases_type_idx" ON "money_transfer_cases"("type");
CREATE INDEX "money_transfer_case_notes_caseId_idx" ON "money_transfer_case_notes"("caseId");

ALTER TABLE "money_transfer_cases" ADD CONSTRAINT "money_transfer_cases_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "money_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "money_transfer_cases" ADD CONSTRAINT "money_transfer_cases_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "money_transfer_cases" ADD CONSTRAINT "money_transfer_cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "money_transfer_cases" ADD CONSTRAINT "money_transfer_cases_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "money_transfer_case_notes" ADD CONSTRAINT "money_transfer_case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "money_transfer_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "money_transfer_case_notes" ADD CONSTRAINT "money_transfer_case_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
