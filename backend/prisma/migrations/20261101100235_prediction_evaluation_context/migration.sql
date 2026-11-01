-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "contextCandles" JSONB,
ADD COLUMN     "evaluatedAt" TIMESTAMP(3),
ADD COLUMN     "sampleCloseStd" JSONB,
ADD COLUMN     "uncertaintySamples" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PriceAlert" ADD COLUMN     "message" TEXT,
ADD COLUMN     "triggeredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Prediction_evaluatedAt_idx" ON "Prediction"("evaluatedAt");

-- CreateIndex
CREATE INDEX "PriceAlert_triggered_symbol_idx" ON "PriceAlert"("triggered", "symbol");
