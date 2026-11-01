import axios from "axios";
import { config } from "../config.js";
import type { Candle } from "../utils/types.js";

export type PredictResult = {
  model_version: string;
  device: string;
  lookback: number;
  pred_len: number;
  max_context: number;
  inference_ms: number;
  temperature: number;
  top_p: number;
  sample_count: number;
  uncertainty_samples: number;
  last_context_timestamp: number;
  predicted: Candle[];
  transformations: unknown[];
  sample_close_std: number[] | null;
  sample_high_std: number[] | null;
  sample_low_std: number[] | null;
  notes: string[];
};

const client = axios.create({
  baseURL: config.aiServiceUrl,
  timeout: config.predictionTimeoutMs,
});

const evaluationClient = axios.create({
  baseURL: config.aiServiceUrl,
  timeout: config.backtestTimeoutMs,
});

export async function getModelInfo() {
  const { data } = await client.get("/model/info");
  return data;
}

export async function health() {
  const { data } = await client.get("/health");
  return data;
}

export async function runPredict(input: {
  candles: Candle[];
  pred_len: number;
  timeframe_ms: number;
  lookback?: number;
  temperature?: number;
  top_p?: number;
  sample_count?: number;
  uncertainty_samples?: number;
}): Promise<PredictResult> {
  const { data } = await client.post("/predict", input);
  return data;
}

export async function runEvaluate(payload: unknown) {
  const { data } = await evaluationClient.post("/evaluate", payload);
  return data;
}
