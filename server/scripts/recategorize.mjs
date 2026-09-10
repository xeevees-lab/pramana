/**
 * One-shot re-categorization of existing events mis-classified as 'politics'.
 * Run from the server/ directory so pg is available.
 */

import { query } from '../src/db/pool.js';
import { inferCategory } from '../src/services/ingestion/clusterer.js';

async function main() {
  const { rows } = await query("SELECT id, title, summary, category FROM events WHERE category = 'politics'");
  console.log(`Found ${rows.length} events currently classified as 'politics'`);

  let reclassified = 0;
  for (const ev of rows) {
    const text = `${ev.title} ${ev.summary || ''}`;
    const newCat = inferCategory(text);
    if (newCat !== 'politics') {
      await query('UPDATE events SET category = $1 WHERE id = $2', [newCat, ev.id]);
      console.log(`  ${ev.title.slice(0, 60)}... -> ${newCat}`);
      reclassified++;
    }
  }

  console.log(`\nRe-classified ${reclassified} events out of ${rows.length} politics events`);
  
  // Show new category distribution
  const { rows: cats } = await query('SELECT category, COUNT(*) FROM events GROUP BY category ORDER BY count DESC');
  console.log('\nUpdated category distribution:');
  for (const c of cats) {
    console.log(`  ${c.category}: ${c.count}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
