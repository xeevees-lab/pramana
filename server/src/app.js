import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import config from './config/index.js';
import { initFirebase } from './plugins/firebase.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import sourcesRoutes from './routes/sources.js';
import articlesRoutes from './routes/articles.js';
import eventsRoutes from './routes/events.js';

/**
 * Create and configure the Fastify application instance.
 * @param {object} opts - Fastify options
 * @returns {import('fastify').FastifyInstance}
 */
export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: config.env === 'development' ? 'info' : 'warn',
      transport: config.env === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    ...opts,
  });

  // --- Content Type Parsers ---
  // Allow empty bodies with Content-Type: application/json (e.g. POST /api/auth/session)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // --- Security ---
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed separately for SPA
  });

  // --- CORS ---
  await app.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        origin === config.clientUrl ||
        (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) ||
        /\.vercel\.app$/.test(origin) ||
        /\.onrender\.com$/.test(origin)
      ) {
        cb(null, true);
        return;
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // --- Rate limiting ---
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  // --- Firebase ---
  initFirebase();

  // --- Routes ---
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(sourcesRoutes, { prefix: '/api' });
  await app.register(articlesRoutes, { prefix: '/api' });
  await app.register(eventsRoutes, { prefix: '/api' });

  // --- Global error handler ---
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Never expose internal details in production
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: config.env === 'development' ? error.message : 'Something went wrong',
      });
    }

    return reply.status(statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
  });

  return app;
}
