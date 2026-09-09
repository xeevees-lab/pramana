import config from '../../config/index.js';
import { query } from '../../db/pool.js';
import { ingestAllSources, ingestSource } from './pipeline.js';

let intervalTimer = null;
let isRunning = false;

/**
 * Start the recurring background ingestion scheduler.
 */
export function startIngestionScheduler() {
  if (intervalTimer) return;

  const intervalMs = (config.ingestion.intervalMinutes || 15) * 60 * 1000;
  console.log(`[Scheduler] Ingestion scheduler started (interval: ${config.ingestion.intervalMinutes}m)`);

  // Run initial ingestion after a short delay (5 seconds) to let server initialize
  setTimeout(() => {
    runScheduledJob().catch(err => console.error('[Scheduler] Initial run failed:', err.message));
  }, 5000);

  intervalTimer = setInterval(() => {
    runScheduledJob().catch(err => console.error('[Scheduler] Scheduled run failed:', err.message));
  }, intervalMs);
}

/**
 * Stop the recurring scheduler.
 */
export function stopIngestionScheduler() {
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
    console.log('[Scheduler] Ingestion scheduler stopped');
  }
}

/**
 * Run a full ingestion job with DB job tracking and lock.
 */
export async function runScheduledJob() {
  if (isRunning) {
    console.log('[Scheduler] Ingestion already in progress, skipping tick');
    return { status: 'skipped', reason: 'already_running' };
  }

  isRunning = true;

  // Record job in database
  let jobId = null;
  try {
    const jobRes = await query(
      `INSERT INTO jobs (type, payload, status, started_at)
       VALUES ('news_ingestion', '{"trigger": "scheduled"}', 'running', NOW())
       RETURNING id`
    );
    jobId = jobRes.rows[0]?.id;
  } catch (dbErr) {
    console.warn('[Scheduler] Could not record job in database:', dbErr.message);
  }

  try {
    const results = await ingestAllSources();

    const totalIngested = results.reduce((acc, r) => acc + (r.ingested || 0), 0);
    const totalFetched = results.reduce((acc, r) => acc + (r.fetched || 0), 0);
    const totalDuplicates = results.reduce((acc, r) => acc + (r.duplicates || 0), 0);

    if (jobId) {
      await query(
        `UPDATE jobs
         SET status = 'completed', completed_at = NOW(),
             result = $2
         WHERE id = $1`,
        [
          jobId,
          JSON.stringify({
            totalIngested,
            totalFetched,
            totalDuplicates,
            sourceCount: results.length,
            sources: results,
          }),
        ]
      );
    }

    return {
      status: 'completed',
      totalIngested,
      totalFetched,
      totalDuplicates,
      results,
    };
  } catch (err) {
    console.error('[Scheduler] Error in ingestion job:', err.message);

    if (jobId) {
      await query(
        `UPDATE jobs
         SET status = 'failed', completed_at = NOW(), error = $2
         WHERE id = $1`,
        [jobId, err.message]
      );
    }
    throw err;
  } finally {
    isRunning = false;
  }
}

/**
 * Trigger an immediate ingestion job (for manual API call).
 * @param {string} [sourceId] - Optional specific source ID
 */
export async function triggerManualIngestion(sourceId = null) {
  if (sourceId) {
    const { rows } = await query('SELECT * FROM sources WHERE id = $1', [sourceId]);
    if (rows.length === 0) {
      throw new Error(`Source ${sourceId} not found`);
    }
    return await ingestSource(rows[0]);
  }

  return await runScheduledJob();
}
