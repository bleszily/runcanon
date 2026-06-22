import levenshtein from "fast-levenshtein";

import type { Episode } from "@runcanon/spec";

/** Distance options for episode comparison. */
export interface DistanceOptions {
  /** Weight for sequence (Levenshtein) distance (0–1). */
  sequenceWeight?: number;
  /** Weight for intent text distance (0–1). */
  intentWeight?: number;
  /** Weight for outcome distance (0–1). */
  outcomeWeight?: number;
  /** Weight for length difference (0–1). */
  lengthWeight?: number;
}

const DEFAULT_OPTIONS: Required<DistanceOptions> = {
  sequenceWeight: 0.55,
  intentWeight: 0.3,
  outcomeWeight: 0.05,
  lengthWeight: 0.1,
};

/**
 * Compute a hybrid distance between two episodes.
 *
 * Combines:
 * - Normalized Levenshtein distance on action signatures
 * - Normalized edit distance on intent text
 * - Outcome mismatch penalty
 * - Relative length difference
 */
export function episodeDistance(a: Episode, b: Episode, options: DistanceOptions = {}): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const seqDist = normalizedEditDistance(a.signature, b.signature);
  const intentDist = normalizedStringDistance(a.intent, b.intent);
  const outcomeDist = a.outcome === b.outcome ? 0 : 1;
  const lengthDist = lengthDifference(a.signature.length, b.signature.length);

  return (
    opts.sequenceWeight * seqDist +
    opts.intentWeight * intentDist +
    opts.outcomeWeight * outcomeDist +
    opts.lengthWeight * lengthDist
  );
}

/** Normalized Levenshtein distance for string arrays. */
export function normalizedEditDistance(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 1;
  const distance = levenshtein.get(a.join("|"), b.join("|"));
  const maxLength = Math.max(a.length, b.length);
  return distance / maxLength;
}

/** Normalized Levenshtein distance for strings. */
export function normalizedStringDistance(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 1;
  const distance = levenshtein.get(a, b);
  const maxLength = Math.max(a.length, b.length);
  return distance / maxLength;
}

/** Relative length difference, bounded at 1. */
function lengthDifference(a: number, b: number): number {
  const max = Math.max(a, b, 1);
  return Math.abs(a - b) / max;
}

/** Compute a full pairwise distance matrix for a set of episodes. */
export function computeDistanceMatrix(episodes: Episode[], options?: DistanceOptions): number[][] {
  const n = episodes.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const distance = episodeDistance(episodes[i], episodes[j], options);
      matrix[i][j] = distance;
      matrix[j][i] = distance;
    }
  }

  return matrix;
}
