import { buildApp } from './app.js';
import config from './config/index.js';
import pool from './db/pool.js';
import { close as closeNeo4j } from './db/neo4j.js';
import { startIngestionScheduler, stopIngestionScheduler } from './services/ingestion/scheduler.js';

const app = await buildApp();

// Graceful shutdown
const shutdown = async (signal) => {
  app.log.info(`Received ${signal}. Shutting down gracefully...`);
  stopIngestionScheduler();
  await app.close();
  await pool.end();
  await closeNeo4j();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`PRAMĀṆA server listening on port ${config.port}`);
  // Start background news ingestion
  startIngestionScheduler();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
