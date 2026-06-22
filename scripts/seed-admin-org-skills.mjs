#!/usr/bin/env node
/**
 * Seed advanced engineering + security skills into org library (admin/curator).
 * Usage: node scripts/seed-admin-org-skills.mjs [--server URL] [--email E] [--password P]
 */
import { serializeSkill } from "../packages/spec/dist/index.js";

const server = (process.env.RUNCANON_SERVER ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.RUNCANON_ADMIN_EMAIL ?? "admin@runcanon.ai";
const password = process.env.RUNCANON_ADMIN_PASSWORD ?? "KeyBoard@2021";

const now = new Date().toISOString();

function skill(def) {
  return serializeSkill({
    version: 1,
    status: "active",
    scope: ["org-wide"],
    harnesses: ["claude", "cursor", "copilot", "codex"],
    tags: def.tags,
    triggers: def.triggers,
    preconditions: def.preconditions ?? [],
    workflow: def.workflow,
    validation: def.validation ?? [
      { description: "Workflow completed with documented outcomes.", severity: "error" },
    ],
    examples: def.examples ?? [],
    metrics: {
      frequency: 0,
      successRate: 0,
      failureRate: 0,
      weaknessScore: 0,
      stalenessScore: 0,
      importanceScore: 0.85,
      generatedAt: now,
      sampleSize: 0,
    },
    ...def,
  });
}

const SKILLS = [
  {
    id: "stride-threat-model",
    name: "STRIDE Threat Model",
    description:
      "Produce a STRIDE threat model for a feature or service with mitigations mapped to OWASP and MITRE ATT&CK.",
    tags: ["security", "threat-modeling", "architecture"],
    triggers: [
      { pattern: "threat model" },
      { pattern: "STRIDE analysis" },
      { pattern: "security design review" },
    ],
    preconditions: [
      "Feature scope, data flows, and trust boundaries are identified or can be inferred from the repo.",
    ],
    workflow: [
      {
        id: "1",
        instruction: "Diagram actors, assets, entry points, and trust boundaries.",
        action: "read_architecture",
        expectedOutcome: "Data-flow summary with inbound/outbound dependencies.",
      },
      {
        id: "2",
        instruction: "Apply STRIDE per component (Spoofing, Tampering, Repudiation, Information disclosure, DoS, Elevation).",
        action: "threat_enumeration",
      },
      {
        id: "3",
        instruction: "Rate each threat (High/Medium/Low) with exploitability and business impact.",
        action: "risk_rating",
      },
      {
        id: "4",
        instruction: "Recommend mitigations, existing controls, and residual risk owners.",
        action: "mitigation_plan",
      },
    ],
    examples: [
      {
        prompt: "Threat model the new OAuth callback endpoint",
        plan: "Map flows → STRIDE table → prioritized mitigations → test recommendations.",
      },
    ],
  },
  {
    id: "secure-code-review",
    name: "Secure Code Review",
    description:
      "OWASP-aligned security code review for PRs: injection, authz, secrets, crypto, and unsafe defaults.",
    tags: ["security", "code-review", "owasp"],
    triggers: [{ pattern: "security review" }, { pattern: "secure code review" }, { pattern: "review PR for security" }],
    workflow: [
      {
        id: "1",
        instruction: "Identify changed attack surface (APIs, auth, file I/O, subprocess, SQL, templates).",
        action: "diff_scope",
      },
      {
        id: "2",
        instruction: "Scan for OWASP Top 10 patterns (injection, broken access control, misconfig, SSRF, etc.).",
        action: "static_review",
      },
      {
        id: "3",
        instruction: "Verify authn/authz on every new route and sensitive operation.",
        action: "authz_check",
      },
      {
        id: "4",
        instruction: "Report findings as severity-ranked issues with file:line and concrete fix.",
        action: "report",
      },
    ],
  },
  {
    id: "cve-dependency-audit",
    name: "CVE Dependency Audit",
    description:
      "Audit direct and transitive dependencies for known CVEs, reachability, and upgrade paths.",
    tags: ["security", "dependencies", "cve", "supply-chain"],
    triggers: [
      { pattern: "audit dependencies" },
      { pattern: "known CVEs" },
      { pattern: "supply chain security" },
    ],
    workflow: [
      { id: "1", instruction: "Inventory lockfiles and package manifests across the monorepo.", action: "inventory" },
      {
        id: "2",
        instruction: "Cross-reference advisories (GHSA/CVE) and classify by severity and reachability.",
        action: "cve_lookup",
      },
      {
        id: "3",
        instruction: "Propose minimal safe upgrades or compensating controls for unreachable findings.",
        action: "remediation",
      },
      {
        id: "4",
        instruction: "Summarize risk for security team: P0–P3 with owners and verification steps.",
        action: "executive_summary",
      },
    ],
  },
  {
    id: "incident-response-triage",
    name: "Security Incident Triage",
    description:
      "Triage suspected security incidents: scope, containment, evidence preservation, and comms checklist.",
    tags: ["security", "incident-response", "soc"],
    triggers: [{ pattern: "security incident" }, { pattern: "incident triage" }, { pattern: "suspected breach" }],
    workflow: [
      { id: "1", instruction: "Classify incident type and initial severity (P0–P3).", action: "classify" },
      { id: "2", instruction: "Identify affected systems, accounts, and data classes.", action: "scope" },
      { id: "3", instruction: "Recommend immediate containment without destroying evidence.", action: "contain" },
      { id: "4", instruction: "Draft timeline, IoCs, and stakeholder notification checklist.", action: "communicate" },
    ],
  },
  {
    id: "architecture-review",
    name: "Architecture Review",
    description:
      "Structured engineering architecture review: boundaries, scalability, reliability, and operability.",
    tags: ["engineering", "architecture", "design"],
    triggers: [{ pattern: "architecture review" }, { pattern: "design review" }, { pattern: "system design" }],
    workflow: [
      { id: "1", instruction: "Summarize goals, constraints, and quality attributes (SLOs, scale, cost).", action: "context" },
      { id: "2", instruction: "Evaluate component boundaries, coupling, and failure modes.", action: "structure" },
      { id: "3", instruction: "Review observability, deployment, rollback, and runbooks.", action: "operations" },
      { id: "4", instruction: "List risks, alternatives, and recommended next decisions.", action: "recommendations" },
    ],
  },
  {
    id: "production-readiness",
    name: "Production Readiness Review",
    description:
      "Pre-release checklist: testing, monitoring, security, docs, and rollout plan for production changes.",
    tags: ["engineering", "sre", "release"],
    triggers: [{ pattern: "production readiness" }, { pattern: "release checklist" }, { pattern: "go-live review" }],
    workflow: [
      { id: "1", instruction: "Verify test coverage, CI status, and feature flags for the change.", action: "quality" },
      { id: "2", instruction: "Confirm dashboards, alerts, and on-call runbooks exist.", action: "observability" },
      { id: "3", instruction: "Validate security controls, secrets handling, and rollback strategy.", action: "security" },
      { id: "4", instruction: "Sign off with explicit go/no-go and phased rollout plan.", action: "decision" },
    ],
  },
];

async function login() {
  const res = await fetch(`${server}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, createCliToken: true }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  const token = body.cliToken?.token ?? body.token;
  if (!token) throw new Error("No CLI token in login response");
  return token;
}

async function createOrgSkill(token, markdown) {
  const res = await fetch(`${server}/api/org/skills`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "create", publishToOrg: true, markdown }),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function listOrgSkills(token) {
  const res = await fetch(`${server}/api/org/skills`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List failed (${res.status}): ${await res.text()}`);
  return res.json();
}

const token = await login();
console.log(`Signed in as ${email} on ${server}\n`);

const results = [];
for (const def of SKILLS) {
  const markdown = skill(def);
  try {
    const out = await createOrgSkill(token, markdown);
    results.push({ id: def.id, name: def.name, ok: true, orgPublished: out.orgPublished ?? true });
    console.log(`✓ ${def.id} → org library`);
  } catch (err) {
    results.push({ id: def.id, name: def.name, ok: false, error: err.message });
    console.log(`✗ ${def.id}: ${err.message}`);
  }
}

const org = await listOrgSkills(token);
console.log(`\nOrg library: ${org.total ?? org.skills?.length ?? 0} skill(s)`);
for (const s of org.skills ?? []) {
  console.log(`  - ${s.skill?.id ?? s.id}: ${s.skill?.name ?? s.name ?? ""}`);
}

process.exit(results.some((r) => !r.ok) ? 1 : 0);
