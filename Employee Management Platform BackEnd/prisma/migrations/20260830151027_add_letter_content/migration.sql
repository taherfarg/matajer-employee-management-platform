-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contentAr" TEXT,
ADD COLUMN     "contentEn" TEXT,
ADD COLUMN     "isAiGenerated" BOOLEAN NOT NULL DEFAULT false;
