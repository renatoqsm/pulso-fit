-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaCipher" TEXT,
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaIv" TEXT,
ADD COLUMN     "mfaLastCounter" INTEGER,
ADD COLUMN     "mfaRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaSalt" TEXT;

