export type SkillStatus = "active" | "proposed" | "retired" | "deprecated";
export type ProposalStatus = "pending" | "approved" | "rejected" | "applied";
export type ProposalType = "create" | "update" | "merge" | "retire";
export type HarnessType = "api" | "browser" | "cli" | "memory" | "code";
export type AutonomyLevel = "show" | "ask" | "do-show" | "do-tell";

export interface HarnessIcon {
  id: string;
  label: string;
  type: HarnessType;
  count?: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  markdown: string;
  tags: string[];
  harnesses: HarnessIcon[];
  usage: {
    calls7d: number;
    calls30d: number;
    successRate: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Proposal {
  id: string;
  type: ProposalType;
  status: ProposalStatus;
  skillId?: string;
  skillName: string;
  confidence: number;
  reason: string;
  sampleSize: number;
  oldMarkdown?: string;
  newMarkdown?: string;
  createdAt: string;
  updatedAt: string;
  auditLog: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  note?: string;
}

export interface TrajectoryEvent {
  id: string;
  step: number;
  type: string;
  description: string;
  timestamp: string;
}

export interface Trajectory {
  id: string;
  project: string;
  intent: string;
  signature: string;
  signatureSteps: string[];
  sessionId: string;
  outcome: "success" | "failure" | "partial" | "unknown";
  durationMs: number | null;
  episodeCount: number;
  events: TrajectoryEvent[];
  startedAt: string;
  /** catalog = imported SKILL.md reference; session = live agent JSONL */
  sourceKind: "catalog" | "session" | "document";
  sessionLabel: string;
}

export interface DashboardStats {
  skillCount: number;
  proposalCount: number;
  trajectoryCount: number;
  goalAlignment: number;
}

export interface AutonomyLadder {
  taskType: string;
  level: AutonomyLevel;
  description: string;
}

export interface AutonomySettings {
  globalEnabled: boolean;
  emergencyStop: boolean;
  undoWindowMinutes: number;
  ladders: AutonomyLadder[];
}
