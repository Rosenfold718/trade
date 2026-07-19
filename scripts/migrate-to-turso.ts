/**
 * Migration script: Move data from JSON files to Turso DB.
 * Run: cd /home/z/my-project/trade && bun run scripts/migrate-to-turso.ts
 */
import { migrateFromJson } from '../src/lib/trading-db';

async function main() {
  console.log('Starting migration from JSON to Turso DB...');
  try {
    const result = await migrateFromJson();
    console.log('Migration complete:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
  process.exit(0);
}

main();