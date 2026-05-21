/**
 * Server-only search config (uses usearch native addon).
 * Do not import from client code.
 *
 * For client-safe config, import from $lib/config instead.
 */
import { MetricKind, ScalarKind } from 'usearch';
import type { IndexConfig } from 'usearch';

export const EMBEDDING_MODEL = 'Xenova/bge-large-en-v1.5';
export const EMBEDDING_DIM = 1024;

/**
 * Shared USearch index configuration.
 * Used by both build-index.ts (build time) and db.ts (search time).
 * Must be identical in both places for consistent index structure.
 */
export const SEARCH_INDEX_CONFIG: IndexConfig = {
  dimensions: EMBEDDING_DIM,
  metric: MetricKind.Cos,
  quantization: ScalarKind.BF16,
  connectivity: 16,
  expansion_add: 128,
  expansion_search: 200,
  multi: false,
};
