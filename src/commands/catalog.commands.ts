import { Command, CommandRunner, Option } from 'nest-commander';
import { CatalogReviewService } from '../services/catalog-review.service';
import { resolveWorkspacePath } from './common-options';

interface RepositoryReviewOptions {
  workspace?: string;
  root?: string;
  accept?: string;
  acceptAll?: boolean;
  ignore?: string;
  json?: boolean;
}

@Command({ name: 'repository:review', description: 'List detected candidates, accept all, or accept/ignore explicit candidate IDs.' })
export class RepositoryReviewCommand extends CommandRunner {
  constructor(private readonly review: CatalogReviewService) { super(); }
  async run(_params: string[], options: RepositoryReviewOptions): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    if (options.acceptAll) {
      if (options.accept || options.ignore) {
        throw new Error('--accept-all cannot be combined with --accept or --ignore.');
      }
      const candidates = await this.review.listDetected(workspace);
      const result = await this.review.apply(workspace, candidates.map((item) => item.id));
      const remaining = await this.review.listDetected(workspace);
      if (options.json) {
        console.log(JSON.stringify({
          requested: candidates.length,
          accepted: result.accepted,
          failed: result.failed,
          items: result.items,
          remaining,
        }, null, 2));
      } else if (candidates.length === 0) {
        console.log('No detected candidates are awaiting review.');
      } else {
        console.log(`Accepted ${result.accepted}/${candidates.length} detected candidate(s).`);
        for (const item of result.items.filter((entry) => entry.status === 'failed')) {
          console.error(`FAILED ${item.key}: ${item.error}`);
        }
        if (remaining.length > 0) console.log(`${remaining.length} candidate(s) remain awaiting review.`);
      }
      if (result.failed > 0) process.exitCode = 1;
      return;
    }

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
  @Option({ flags: '--accept-all', description: 'Accept every detected candidate currently awaiting review.' }) parseAcceptAll(): boolean { return true; }
  @Option({ flags: '--ignore <ids>', description: 'Comma-separated candidate IDs to ignore.' }) parseIgnore(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
