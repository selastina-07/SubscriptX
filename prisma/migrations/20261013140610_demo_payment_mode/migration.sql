-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('RAZORPAY', 'DEMO');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "mode" "PaymentMode" NOT NULL DEFAULT 'RAZORPAY';
