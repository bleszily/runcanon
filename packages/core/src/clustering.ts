import { randomUUID } from "node:crypto";

import type { DiscoveredCluster, Episode, TransitionGraph } from "@runcanon/spec";

import { formatSkillDisplayName, isPathLikeFragment, sanitizeActionLabel } from "./path-labels.js";

/** Options for hierarchical clustering. */
export interface ClusteringOptions {
  /** Maximum distance threshold for merging clusters. */
  distanceThreshold?: number;
  /** Linkage criterion: single, complete, average, ward. */
  linkage?: "single" | "complete" | "average" | "ward";
  /** Minimum cluster size to be reported. */
  minClusterSize?: number;
}

const DEFAULT_OPTIONS: Required<ClusteringOptions> = {
  distanceThreshold: 0.45,
  linkage: "average",
  minClusterSize: 2,
};

/** A node in the hierarchical clustering dendrogram. */
interface ClusterNode {
  indices: number[];
  distance: number;
  left?: ClusterNode;
  right?: ClusterNode;
}

/**
 * Perform agglomerative hierarchical clustering on episodes using a distance matrix.
 *
 * Returns flat clusters by cutting the dendrogram at the configured threshold.
 */
export function clusterEpisodes(
  episodes: Episode[],
  distanceMatrix: number[][],
  options: ClusteringOptions = {}
): DiscoveredCluster[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const n = episodes.length;
  if (n === 0) return [];

  // Each episode starts as its own cluster.
  const nodes: ClusterNode[] = episodes.map((_, index) => ({ indices: [index], distance: 0 }));

  // Track the live distance matrix between current clusters.
  let matrix = initializeClusterMatrix(distanceMatrix);

  while (nodes.length > 1) {
    const { i, j, distance } = findClosestPair(matrix);
    if (distance > opts.distanceThreshold) break;

    const left = nodes.splice(Math.max(i, j), 1)[0];
    const right = nodes.splice(Math.min(i, j), 1)[0];
    const merged: ClusterNode = {
      indices: [...left.indices, ...right.indices],
      distance,
      left,
      right,
    };

    nodes.push(merged);
    matrix = recomputeMatrix(matrix, i, j, merged.indices, opts.linkage);
  }

  return nodes
    .filter((node) => node.indices.length >= opts.minClusterSize)
    .map((node) => buildCluster(node, episodes));
}

/** Build a DiscoveredCluster from a cluster node. */
function buildCluster(node: ClusterNode, episodes: Episode[]): DiscoveredCluster {
  const clusterEpisodes = node.indices.map((index) => episodes[index]);
  const signature = computeRepresentativeSignature(clusterEpisodes);
  const transitionGraph = buildTransitionGraph(clusterEpisodes);
  const coherenceScore = computeCoherenceScore(node.distance, clusterEpisodes.length);

  return {
    id: `c-${randomUUID().slice(0, 8)}`,
    name: inferClusterName(clusterEpisodes, signature),
    description: inferClusterDescription(clusterEpisodes, signature),
    exemplars: clusterEpisodes.slice(0, 5),
    transitionGraph,
    coherenceScore,
    size: clusterEpisodes.length,
  };
}

/** Initialize the cluster-to-cluster distance matrix from episode distances. */
function initializeClusterMatrix(distanceMatrix: number[][]): number[][] {
  return distanceMatrix.map((row) => [...row]);
}

/** Find the closest pair of clusters in the current matrix. */
function findClosestPair(matrix: number[][]): { i: number; j: number; distance: number } {
  let minDistance = Number.POSITIVE_INFINITY;
  let bestI = -1;
  let bestJ = -1;

  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      if (matrix[i][j] < minDistance) {
        minDistance = matrix[i][j];
        bestI = i;
        bestJ = j;
      }
    }
  }

  return { i: bestI, j: bestJ, distance: minDistance };
}

/** Recompute the distance matrix after merging two clusters. */
function recomputeMatrix(
  oldMatrix: number[][],
  removedI: number,
  removedJ: number,
  _mergedIndices: number[],
  linkage: ClusteringOptions["linkage"]
): number[][] {
  const minIdx = Math.min(removedI, removedJ);
  const maxIdx = Math.max(removedI, removedJ);
  const newMatrix: number[][] = [];

  for (let i = 0; i < oldMatrix.length; i++) {
    if (i === minIdx || i === maxIdx) continue;

    const row: number[] = [];
    for (let j = 0; j < oldMatrix.length; j++) {
      if (j === minIdx || j === maxIdx || i === j) continue;
      row.push(oldMatrix[i][j]);
    }

    // Compute distance from remaining cluster i to merged cluster.
    const distanceToMerged = computeLinkageDistance(
      oldMatrix,
      i,
      minIdx,
      maxIdx,
      linkage ?? "average"
    );
    row.push(distanceToMerged);
    newMatrix.push(row);
  }

  // Add the merged cluster's row.
  const mergedRow: number[] = [];
  for (let k = 0; k < newMatrix.length; k++) {
    mergedRow.push(newMatrix[k][newMatrix[k].length - 1]);
  }
  mergedRow.push(0);
  newMatrix.push(mergedRow);

  return newMatrix;
}

/** Compute linkage distance between a cluster and a merged pair. */
function computeLinkageDistance(
  matrix: number[][],
  clusterIndex: number,
  leftIndex: number,
  rightIndex: number,
  linkage: NonNullable<ClusteringOptions["linkage"]>
): number {
  const a = matrix[clusterIndex][leftIndex];
  const b = matrix[clusterIndex][rightIndex];

  switch (linkage) {
    case "single":
      return Math.min(a, b);
    case "complete":
      return Math.max(a, b);
    case "average":
      return (a + b) / 2;
    case "ward": {
      // Ward's method simplified: weighted average by cluster sizes.
      return (a + b) / 2;
    }
    default:
      return (a + b) / 2;
  }
}

/** Compute a representative action signature from a cluster (most common prefix). */
function computeRepresentativeSignature(episodes: Episode[]): string[] {
  if (episodes.length === 0) return [];

  // Find the longest common prefix of action signatures.
  let prefix = episodes[0].signature;
  for (const episode of episodes.slice(1)) {
    prefix = longestCommonPrefix(prefix, episode.signature);
    if (prefix.length === 0) break;
  }

  return prefix.length > 0 ? prefix : mostFrequentFirstAction(episodes);
}

function longestCommonPrefix(a: string[], b: string[]): string[] {
  const length = Math.min(a.length, b.length);
  const prefix: string[] = [];
  for (let i = 0; i < length; i++) {
    if (a[i] === b[i]) {
      prefix.push(a[i]);
    } else {
      break;
    }
  }
  return prefix;
}

function mostFrequentFirstAction(episodes: Episode[]): string[] {
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    if (episode.signature.length === 0) continue;
    const first = episode.signature[0];
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1]).at(0);
  return winner ? [winner[0]] : [];
}

/** Build a transition graph from episode action signatures. */
function buildTransitionGraph(episodes: Episode[]): TransitionGraph {
  const nodes: TransitionGraph["nodes"] = {};
  const edges: TransitionGraph["edges"] = {};

  for (const episode of episodes) {
    const signature = episode.signature;
    const success = episode.outcome === "success" ? 1 : 0;

    for (let i = 0; i < signature.length; i++) {
      const action = signature[i];
      nodes[action] = incrementNode(nodes[action], success);

      if (i < signature.length - 1) {
        const next = signature[i + 1];
        const key = `${action}->${next}`;
        edges[key] = incrementEdge(edges[key], success);
      }
    }
  }

  return { nodes, edges };
}

function incrementNode(
  node: TransitionGraph["nodes"][string] | undefined,
  success: number
): TransitionGraph["nodes"][string] {
  return {
    count: (node?.count ?? 0) + 1,
    successCount: (node?.successCount ?? 0) + success,
  };
}

function incrementEdge(
  edge: TransitionGraph["edges"][string] | undefined,
  success: number
): TransitionGraph["edges"][string] {
  return {
    count: (edge?.count ?? 0) + 1,
    successCount: (edge?.successCount ?? 0) + success,
  };
}

/** Coherence score: higher is better. Penalizes merge distance and small clusters. */
function computeCoherenceScore(mergeDistance: number, clusterSize: number): number {
  const distancePenalty = Math.min(mergeDistance, 1);
  const sizeBoost = Math.min(clusterSize / 10, 1);
  return Math.max(0, 1 - distancePenalty) * 0.7 + sizeBoost * 0.3;
}

/** Infer a short cluster name from common intent words and signature. */
function inferClusterName(episodes: Episode[], signature: string[]): string {
  const words = episodes.flatMap((episode) =>
    episode.intent
      .toLowerCase()
      .split(/\s+/)
      .flatMap((word) => word.split(/[/\\-]+/))
  );
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "for",
    "to",
    "in",
    "on",
    "of",
    "and",
    "or",
    "with",
    "document",
    "section",
    "users",
    "documents",
    "home",
    "existing",
    "skill",
  ]);
  const candidates = words.filter((word) => word.length > 2 && !stopWords.has(word) && !isPathLikeFragment(word));

  const counts = new Map<string, number>();
  for (const word of candidates) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const nameWords = top.map(([word]) => word);

  if (signature.length > 0) {
    const last = sanitizeActionLabel(signature[signature.length - 1] ?? "");
    if (last && !isPathLikeFragment(last)) {
      nameWords.push(last.replace(/\.[a-z0-9]+$/i, ""));
    }
  }

  const raw = nameWords.length > 0 ? nameWords.join("-") : "unnamed-cluster";
  return formatSkillDisplayName(raw).toLowerCase().replace(/\s+/g, "-");
}

/** Infer a one-line description from common intents. */
function inferClusterDescription(episodes: Episode[], signature: string[]): string {
  const intents = episodes.map((episode) => episode.intent);
  const commonPrefix = intents.reduce((prefix, intent) => longestCommonSubstring(prefix, intent), intents[0] ?? "");
  const actionList = signature.slice(0, 3).join(" → ");
  return commonPrefix.length > 10
    ? `Workflow for ${commonPrefix.trim()}`
    : `Workflow using ${actionList}`;
}

/** Longest common substring helper. */
function longestCommonSubstring(a: string, b: string): string {
  if (!a || !b) return "";
  let longest = "";
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) {
        k++;
      }
      if (k > longest.length) {
        longest = a.slice(i, i + k);
      }
    }
  }
  return longest;
}
