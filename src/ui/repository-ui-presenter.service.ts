import { Injectable } from '@nestjs/common';
import { StoredRepository } from '../models/repository-state';

const STATUS_SYMBOL: Record<string, string> = {
  NEVER: '○', RUNNING: '…', READY: '●', STALE: '↻', FAILED: '!', MISSING: '×',
};
const STATUS_LABEL: Record<string, string> = {
  NEVER: 'not inspected', RUNNING: 'inspecting', READY: 'up to date', STALE: 'out of date', FAILED: 'failed', MISSING: 'missing path or graph',
};

export interface InspectionRow {
  key: string;
  ok: boolean;
  nodeCount?: number;
  edgeCount?: number;
  communityCount?: number;
  durationMs: number;
  clustered?: boolean;
  error?: string;
}

@Injectable()
export class RepositoryUiPresenterService {
  technologySummary(repositories: Array<{ key: string; technology: string; technologyLabel: string }>): string[] {
    const classified = new Map<string, number>();
    const unclassified: string[] = [];

    for (const repository of repositories) {
      if (repository.technology === 'unknown') {
        unclassified.push(repository.key);
        continue;
      }
      classified.set(repository.technologyLabel, (classified.get(repository.technologyLabel) ?? 0) + 1);
    }

    const lines = [...classified.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([technology, count]) => `- ${technology}: ${count}`);

    if (unclassified.length > 0) {
      lines.push(`- Unclassified: ${unclassified.length}`);
      lines.push(...unclassified.sort((left, right) => left.localeCompare(right)).map((key) => `  - ${key}`));
      lines.push(`⚠ ${unclassified.length} ${unclassified.length === 1 ? 'repository requires' : 'repositories require'} technology and category configuration.`);
    }

    return lines;
  }

  technologyDetails(repositories: Array<{
    key: string;
    technology: string;
    technologyLabel: string;
    artifactKind: string;
    inspectionStatus: string;
    technologyVersion?: string;
    technologyConstraints: string[];
  }>): string[] {
    const groups = new Map<string, typeof repositories>();
    const unclassified: typeof repositories = [];
    for (const repository of repositories) {
      if (repository.technology === 'unknown') {
        unclassified.push(repository);
        continue;
      }
      const group = groups.get(repository.technologyLabel) ?? [];
      group.push(repository);
      groups.set(repository.technologyLabel, group);
    }
    const lines: string[] = [];
    for (const [technology, members] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- ${technology}: ${members.length}`);
      for (const member of members.sort((a, b) => a.key.localeCompare(b.key))) {
        const compatibility = member.technologyVersion
          ? ` · version ${member.technologyVersion}`
          : member.technologyConstraints.length
            ? ` · compatible ${member.technologyConstraints.join(', ')}`
            : '';
        lines.push(`  ${this.statusSymbol(member.inspectionStatus)} ${member.key} [${member.artifactKind}]${compatibility}`);
      }
    }
    if (unclassified.length > 0) {
      lines.push(`- Unclassified: ${unclassified.length}`);
      for (const member of unclassified.sort((a, b) => a.key.localeCompare(b.key))) {
        lines.push(`  ${this.statusSymbol(member.inspectionStatus)} ${member.key}`);
      }
      lines.push(`⚠ ${unclassified.length} ${unclassified.length === 1 ? 'repository requires' : 'repositories require'} technology and category configuration.`);
    }
    return lines;
  }

  statusSymbol(status: string): string {
    return STATUS_SYMBOL[status] ?? '?';
  }

  statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status.toLowerCase();
  }

  options(repositories: StoredRepository[]): Array<{ value: string; label: string; hint: string }> {
    return repositories.map((item) => ({
      value: item.id,
      label: `${this.statusSymbol(item.inspectionStatus)} ${item.key} · ${item.technologyLabel}`,
      hint: `${this.statusLabel(item.inspectionStatus)} · ${item.category} · ${item.sourcePath}`,
    }));
  }

  matches = (search: string, option: { value: string; label?: string; hint?: string }): boolean => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return true;
    return `${option.label ?? ''} ${option.hint ?? ''}`.toLowerCase().includes(normalized);
  };

  /** Renders an aligned monospace table; numeric columns (align 'r') are right-justified. */
  formatTable(headers: string[], rows: string[][], align: Array<'l' | 'r'> = []): string {
    const widths = headers.map((header, column) =>
      Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)));
    const pad = (value: string, column: number): string => {
      const width = widths[column];
      return (align[column] ?? 'l') === 'r' ? value.padStart(width) : value.padEnd(width);
    };
    const line = (cells: string[]): string => cells.map((cell, column) => pad(cell ?? '', column)).join('  ');
    const separator = widths.map((width) => '─'.repeat(width)).join('  ');
    return [line(headers), separator, ...rows.map(line)].join('\n');
  }

  /** Builds the results table shown when a Graphify scan finishes (per-technology + totals). */
  inspectionTable(rows: InspectionRow[]): string {
    const number = (value?: number): string => (value === undefined ? '—' : value.toLocaleString('en-US'));
    const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
    const body = rows.map((row) => [
      `${row.ok ? '●' : '!'} ${row.key}`,
      row.ok ? 'READY' : 'FAILED',
      row.ok ? number(row.nodeCount) : '—',
      row.ok ? number(row.edgeCount) : '—',
      row.ok ? number(row.communityCount) : '—',
      row.ok ? (row.clustered === false ? 'no' : 'yes') : '—',
      seconds(row.durationMs),
    ]);
    const succeeded = rows.filter((row) => row.ok);
    const total = (pick: (row: InspectionRow) => number | undefined): string =>
      number(succeeded.reduce((sum, row) => sum + (pick(row) ?? 0), 0));
    const totals = [
      `Σ ${succeeded.length}/${rows.length} ok`,
      '',
      total((row) => row.nodeCount),
      total((row) => row.edgeCount),
      total((row) => row.communityCount),
      '',
      seconds(rows.reduce((sum, row) => sum + row.durationMs, 0)),
    ];
    return this.formatTable(
      ['Technology', 'Status', 'Nodes', 'Edges', 'Communities', 'Cluster', 'Time'],
      [...body, totals],
      ['l', 'l', 'r', 'r', 'r', 'l', 'r'],
    );
  }

  details(repository: StoredRepository): string[] {
    return [
      `${this.statusSymbol(repository.inspectionStatus)} Graph status: ${this.statusLabel(repository.inspectionStatus)}`,
      `Catalog status: ${repository.catalogStatus}`,
      `Technology: ${repository.technologyLabel}`,
      `Kind: ${repository.artifactKind}`,
      repository.packageName
        ? `Package: ${repository.packageName}${repository.packageVersion ? `@${repository.packageVersion}` : ''}`
        : '',
      repository.technologyVersion ? `Technology version: ${repository.technologyVersion}` : '',
      repository.technologyConstraints.length
        ? `Compatible technology versions: ${repository.technologyConstraints.join(', ')}`
        : '',
      `Category: ${repository.category}`,
      `Repository path: ${repository.path}`,
      `Source folder: ${repository.sourcePath}`,
      `Detection confidence: ${repository.confidence}%`,
      `Last inspection: ${repository.lastInspectionAt ?? 'never'}`,
      `Nodes / edges: ${repository.nodeCount ?? '-'} / ${repository.edgeCount ?? '-'}`,
      repository.lastError ? `Last error: ${repository.lastError}` : '',
    ].filter(Boolean);
  }
}
