import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { createLogger } from "../util/logger.js";

const log = createLogger("memory");

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

let embedder: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;
  if (initPromise) return initPromise;

  initPromise = pipeline("feature-extraction", MODEL_NAME).then((p) => {
    embedder = p;
    initPromise = null;
    log.info(`Embedding model loaded: ${MODEL_NAME}`);
    return p;
  }).catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

export async function embed(text: string): Promise<Float32Array> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float64Array);
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const model = await getEmbedder();
  const results: Float32Array[] = [];
  for (const text of texts) {
    const output = await model(text, { pooling: "mean", normalize: true });
    results.push(new Float32Array(output.data as Float64Array));
  }
  return results;
}

export async function warmup(): Promise<void> {
  await getEmbedder();
}
