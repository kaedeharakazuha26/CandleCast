-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "horizon" INTEGER NOT NULL,
    "lookback" INTEGER NOT NULL,
    "marketTimestamp" BIGINT NOT NULL,
    "predictedCandles" JSONB NOT NULL,
    "actualCandles" JSONB,
    "metrics" JSONB,
    "transformations" JSONB,
    "notes" JSONB,
    "modelVersion" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "topP" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "inferenceMs" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explanation" TEXT,
    "direction" TEXT,
    "signal" TEXT,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "horizon" INTEGER NOT NULL,
    "lookback" INTEGER NOT NULL,
    "windowCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB,
    "points" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "WatchlistItem_symbol_key" ON "WatchlistItem"("symbol");
CREATE INDEX "Prediction_symbol_timeframe_createdAt_idx" ON "Prediction"("symbol", "timeframe", "createdAt");
