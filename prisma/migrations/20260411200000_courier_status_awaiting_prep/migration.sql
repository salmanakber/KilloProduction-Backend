-- Food orders: rider pool sees booking only after kitchen prep window (BullMQ promotes to REQUESTED).
ALTER TYPE "CourierStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PREP';
