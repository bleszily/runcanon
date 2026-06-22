/** Read env var with optional legacy fallback (RunCanon ← RunCanon migration). */
export function readEnv(primary: string, legacy?: string): string | undefined {
  const value = process.env[primary];
  if (value !== undefined && value !== "") return value;
  if (legacy) {
    const old = process.env[legacy];
    if (old !== undefined && old !== "") return old;
  }
  return undefined;
}

export function readEnvBool(primary: string, legacy?: string): boolean | undefined {
  const raw = readEnv(primary, legacy);
  if (raw === undefined) return undefined;
  return raw === "true" || raw === "1";
}
