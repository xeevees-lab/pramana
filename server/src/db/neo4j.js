import neo4j from 'neo4j-driver';
import config from '../config/index.js';

let driver = null;

/**
 * Get or create the Neo4j driver singleton.
 * @returns {import('neo4j-driver').Driver}
 */
export function getDriver() {
  if (!driver) {
    driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
      {
        maxConnectionPoolSize: 50,
        connectionTimeout: 10000,
        connectionAcquisitionTimeout: 15000,
        logging: {
          level: config.env === 'development' ? 'warn' : 'error',
          logger: (level, message) => console[level](`[Neo4j] ${message}`),
        },
      }
    );
  }
  return driver;
}

/**
 * Run a Cypher query with parameters.
 * @param {string} cypher - Cypher query
 * @param {object} params - Parameters (always use parameterized queries)
 * @returns {Promise<import('neo4j-driver').QueryResult>}
 */
export async function runCypher(cypher, params = {}) {
  const d = getDriver();
  const result = await d.executeQuery(cypher, params);
  return result;
}

/**
 * Check if Neo4j is reachable.
 * @returns {Promise<boolean>}
 */
export async function isHealthy() {
  try {
    const d = getDriver();
    await d.verifyConnectivity();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the Neo4j driver.
 */
export async function close() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
