import pg from 'pg';
import config from '../config/index.js';

const pool = new pg.Pool({
  connectionString: config.db.connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2, ... placeholders
 * @param {any[]} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.env === 'development' && duration > 200) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
  }
  return result;
}

/**
 * Get a client from the pool for transactions.
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Check if the database is reachable.
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default pool;
