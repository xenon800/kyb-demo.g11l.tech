// Verifies exported audit trails (from the site's "Export JSON" button or audit/).
// Run: node scripts/verify-audit.mjs <file.json> [more files…]
// Exit code 1 if any chain is broken.

import { readFileSync } from 'node:fs';
import { verifyExport, EXPORT_FORMAT } from '../assets/audit.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.log('Usage: node scripts/verify-audit.mjs <export.json> [...]');
  process.exit(2);
}

let broken = 0;
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data.format !== EXPORT_FORMAT) console.log(`! ${file}: unexpected format "${data.format}"`);
  const r = await verifyExport(data);
  if (r.ok) console.log(`✓ ${file}: ${r.count} events, chain intact, count and head hash match (head ${r.head_hash.slice(0, 19)}…)`);
  else {
    broken++;
    console.log(`✗ ${file}: broken at ${r.broken_at}: ${r.reason}`);
  }
}
process.exit(broken ? 1 : 0);
