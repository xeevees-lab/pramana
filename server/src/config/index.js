import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load root .env first, then local .env if present
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function formatPrivateKey(rawKey) {
  if (!rawKey) return undefined;
  let key = rawKey.trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  if (!key.includes('BEGIN PRIVATE KEY')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }
  return key;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  db: {
    connectionString: process.env.DATABASE_URL || 'postgresql://pramana:pramana_dev@localhost:5433/pramana',
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5433,
    user: process.env.PGUSER || 'pramana',
    password: process.env.PGPASSWORD || 'pramana_dev',
    database: process.env.PGDATABASE || 'pramana',
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'pramana_neo4j_dev',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },

  newsapi: {
    apiKey: process.env.NEWSAPI_KEY,
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  },

  ingestion: {
    intervalMinutes: parseInt(process.env.INGESTION_INTERVAL_MINUTES, 10) || 15,
    maxRetries: parseInt(process.env.INGESTION_MAX_RETRIES, 10) || 3,
  },
};

export default config;
