import { Command, CommandRunner, Option } from 'nest-commander';
import { CatalogReviewService } from '../services/catalog-review.service';
import { resolveWorkspacePath } from './common-options';

@Command({ name: 'repository:review', description: 'List detected candidates or accept/ignore explicit candidate IDs.' })
export class RepositoryReviewCommand extends CommandRunner {
  constructor(private readonly review: CatalogReviewService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string; accept?: string; ignore?: string; json?: boolean }): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const acceptedIds = options.accept ? options.accept.split(',').map((item) => item.trim()).filter(Boolean) : [];
    const ignoredIds = options.ignore ? options.ignore.split(',').map((item) => item.trim()).filter(Boolean) : [];
    if (acceptedIds.length) await this.review.setStatus(workspace, acceptedIds, 'ACCEPTED');
    if (ignoredIds.length) await this.review.setStatus(workspace, ignoredIds, 'IGNORED');
    const candidates = await this.review.listDetected(workspace);
    if (options.json) {
      console.log(JSON.stringify({ accepted: acceptedIds.length, ignored: ignoredIds.length, remaining: candidates }, null, 2));
    } else {
      if (acceptedIds.length) console.log(`Accepted ${acceptedIds.length} candidate(s).`);
      if (ignoredIds.length) console.log(`Ignored ${ignoredIds.length} candidate(s).`);
      if (!candidates.length) console.log('No detected candidates are awaiting review.');
      for (const item of candidates) console.log(`${item.id}\t${item.key}\t${item.technologyLabel}\t${item.confidence}%\t${item.path}`);
    }
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--accept <ids>', description: 'Comma-separated candidate IDs to accept.' }) parseAccept(value: string): string { return value; }
  @Option({ flags: '--ignore <ids>', description: 'Comma-separated candidate IDs to ignore.' }) parseIgnore(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
