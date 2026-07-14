import { RepositoryUiPresenterService } from '../src/ui/repository-ui-presenter.service';

describe('RepositoryUiPresenterService.inspectionTable', () => {
  const presenter = new RepositoryUiPresenterService();

  it('renders a per-technology results table with a totals row', () => {
    const table = presenter.inspectionTable([
      { key: 'primevue', ok: true, nodeCount: 13357, edgeCount: 15553, communityCount: 1943, durationMs: 42000, clustered: true },
      { key: 'tailwindcss', ok: true, nodeCount: 3731, edgeCount: 7986, communityCount: 220, durationMs: 8000, clustered: true },
    ]);
    const lines = table.split('\n');

    // Header + separator + two rows + totals row.
    expect(lines[0]).toContain('Technology');
    expect(lines[0]).toContain('Communities');
    expect(lines[0]).toContain('Time');
    expect(table).toContain('primevue');
    expect(table).toContain('13,357'); // thousands separator on node count
    expect(table).toContain('42.0s'); // duration in seconds
    // Totals: 13357 + 3731 = 17088 nodes, 50.0s combined.
    expect(table).toContain('17,088');
    expect(table).toContain('50.0s');
    expect(table).toContain('2/2 ok');
  });

  it('marks failures without inventing node/edge counts', () => {
    const table = presenter.inspectionTable([
      { key: 'spring-boot', ok: false, durationMs: 1200, error: 'Graphify crashed with code -1' },
    ]);
    expect(table).toContain('spring-boot');
    expect(table).toContain('FAILED');
    expect(table).toContain('1.2s');
    expect(table).toContain('0/1 ok');
    // No fabricated totals for a failed-only run.
    expect(table).not.toMatch(/\bnodes\b.*\d/);
  });
});

describe('RepositoryUiPresenterService.technologySummary', () => {
  const presenter = new RepositoryUiPresenterService();

  it('groups classified technologies and identifies unclassified repositories by key', () => {
    const lines = presenter.technologySummary([
      { key: 'web-store', technology: 'react', technologyLabel: 'React' },
      { key: 'admin-panel', technology: 'react', technologyLabel: 'React' },
      { key: 'payments-api', technology: 'unknown', technologyLabel: 'unknown' },
      { key: 'legacy-service', technology: 'unknown', technologyLabel: 'unknown' },
    ]);

    expect(lines).toEqual([
      '- React: 2',
      '- Unclassified: 2',
      '  - legacy-service',
      '  - payments-api',
      '⚠ 2 repositories require technology and category configuration.',
    ]);
    expect(lines.join('\n')).not.toContain('unknown');
  });

  it('uses a singular warning for one unclassified repository', () => {
    expect(presenter.technologySummary([
      { key: 'custom-tool', technology: 'unknown', technologyLabel: 'unknown' },
    ])).toContain('⚠ 1 repository requires technology and category configuration.');
  });
});
