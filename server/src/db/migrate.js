import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import config from '../config/index.js';
import { setupNeo4jSchema } from './neo4j-schema.js';
import { close as closeNeo4j } from './neo4j.js';
import { seedSources } from './seeds/sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const isCloudDb =
    config.env === 'production' ||
    (config.db.connectionString &&
      (config.db.connectionString.includes('sslmode=') ||
        config.db.connectionString.includes('supabase') ||
        config.db.connectionString.includes('neon.tech') ||
        config.db.connectionString.includes('render.com')));

  const client = new pg.Client({
    connectionString: config.db.connectionString,
    ssl: isCloudDb ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('[Migrate] Connected to PostgreSQL');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read migration files
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[Migrate] No migration files found');
      return;
    }

    // Get already applied migrations
    const { rows: applied } = await client.query('SELECT name FROM _migrations ORDER BY id');
    const appliedSet = new Set(applied.map(r => r.name));

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[Migrate] Already applied: ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`[Migrate] Applying: ${file} ...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migrate] Applied: ${file} ✓`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] Failed: ${file}`);
        console.error(err.message);
        process.exit(1);
      }
    }

    if (count === 0) {
      console.log('[Migrate] All migrations already applied');
    } else {
      console.log(`[Migrate] Applied ${count} migration(s) successfully`);
    }

    // Seed default news sources
    try {
      console.log('[Migrate] Seeding default sources...');
      await seedSources();
    } catch (seedErr) {
      console.warn('[Migrate] Seeding sources warning:', seedErr.message);
    }

    // Also apply Neo4j constraints & indexes
    try {
      console.log('[Migrate] Setting up Neo4j constraints & indexes...');
      await setupNeo4jSchema();
      console.log('[Migrate] Neo4j setup complete ✓');
    } catch (neoErr) {
      console.warn('[Migrate] Neo4j schema setup warning:', neoErr.message);
    } finally {
      await closeNeo4j();
    }
  } catch (err) {
    console.error('[Migrate] Connection error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    process.exit(0);
  }
}

migrate();
