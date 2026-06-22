import type { AuditEntry } from "./audit.js";

export interface TrendIndicator {
  direction: "up" | "down" | "flat";
  value: string;
}

/** Build cumulative sparkline buckets from ISO timestamps (oldest → newest). */
export function sparklineFromTimestamps(timestamps: string[], buckets = 12): number[] {
  if (timestamps.length === 0) {
    return Array.from({ length: buckets }, () => 0);
  }

  const sorted = [...timestamps].map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const start = sorted[0];
  const end = Date.now();
  const span = Math.max(end - start, 1);
  const counts = Array.from({ length: buckets }, () => 0);

  for (const ts of sorted) {
    const bucket = Math.min(buckets - 1, Math.floor(((ts - start) / span) * buckets));
    counts[bucket]++;
  }

  let cumulative = 0;
  return counts.map((count) => {
    cumulative += count;
    return cumulative;
  });
}

/** Pending-proposal sparkline — only currently pending items (matches KPI headline). */
export function sparklinePendingProposals(
  proposals: Array<{ status: string; createdAt: string }>,
  buckets = 12
): number[] {
  const timestamps = proposals.filter((p) => p.status === "pending").map((p) => p.createdAt);
  return sparklineFromTimestamps(timestamps, buckets);
}

export function trendFromCounts(recent: number, previous: number, label?: string): TrendIndicator {
  if (recent === previous) {
    return { direction: "flat", value: label ?? "steady" };
  }
  const delta = recent - previous;
  const direction = delta > 0 ? "up" : "down";
  const value = label ?? `${delta > 0 ? "+" : ""}${delta}`;
  return { direction, value };
}

export function percentTrend(current: number, previous: number): TrendIndicator | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return { direction: "up", value: "new" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { direction: "flat", value: "steady" };
  return { direction: pct > 0 ? "up" : "down", value: `${pct > 0 ? "+" : ""}${pct}%` };
}

export function splitAuditByAge(audit: AuditEntry[], days = 7): { recent: AuditEntry[]; previous: AuditEntry[] } {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent: AuditEntry[] = [];
  const previous: AuditEntry[] = [];

  for (const entry of audit) {
    const ts = new Date(entry.timestamp).getTime();
    if (ts >= cutoff) recent.push(entry);
    else previous.push(entry);
  }

  return { recent, previous };
}
