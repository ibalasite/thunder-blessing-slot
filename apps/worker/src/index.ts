/**
 * Worker entry point — runs periodic maintenance tasks:
 *   - rtpReport:    daily RTP audit (runs at 00:05 UTC)
 *   - spinLogArchive: archive old spin_logs partitions (monthly)
 *
 * For Phase 2A, this can be invoked via cron job or triggered manually.
 * Phase 2B: deploy as separate Render Cron Job service.
 */

import { rtpReport } from './rtpReport';
import { spinLogArchive } from './spinLogArchive';

const task = process.argv[2];

async function main() {
  if (!task) {
    console.error('Usage: ts-node src/index.ts <rtpReport|spinLogArchive>');
    process.exit(1);
  }

  switch (task) {
    case 'rtpReport':
      await rtpReport();
      break;
    case 'spinLogArchive':
      await spinLogArchive();
      break;
    default:
      console.error(`Unknown task: ${task}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[Worker error]', err);
  process.exit(1);
});
