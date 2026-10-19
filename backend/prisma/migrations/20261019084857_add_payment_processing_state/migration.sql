-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "captureStartedAt" TIMESTAMP(3);
