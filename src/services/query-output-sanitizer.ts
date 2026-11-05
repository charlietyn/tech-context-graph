/**
 * Defence in depth only. Graphify output is untrusted and callers MUST NOT treat it
 * as instructions, authorization, or a secret-free attestation. This scrubber removes
 * obvious credential shapes and machine-specific workspace paths.
 */
export function sanitizeGraphifyOutput(output: string, localRoots: string[] = []): string {
  let clean = output;
  const roots = [...new Set(localRoots.flatMap((path) => {
    if (!path || path.length < 3) return [];
    return [path, path.replace(/\\/g, '/'), path.replace(/\//g, '\\')];
  }))].sort((a, b) => b.length - a.length);
  for (const root of roots) clean = clean.split(root).join('[LOCAL_PATH]');
  clean = clean
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_TOKEN]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]{8,}/gi, '$1[REDACTED_TOKEN]')
    .replace(/(\b(?:password|api[_-]?key|access[_-]?token|secret|private[_-]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED_VALUE]');
  return clean;
}
