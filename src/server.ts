import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { registerProfileRoutes } from './profile-routes.js';
import { errorResponse } from './http-error.js';
import { guard, identity } from './accounts.js';
import { clientUrl, demo, memUsers } from './state.js';
import { initialize } from './startup.js';
import { expireReservations } from './order-store.js';
import { registerCatalogueRoutes } from './routes/catalogue.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerFavoriteRoutes } from './routes/favorites.js';
import { registerOrderRoutes } from './routes/orders.js';
import { payfastItnRaw, registerPayfastRoutes } from './routes/payfast.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerHealthRoutes } from './health.js';
import { registerInsightsRoutes, recordApiError } from './insights.js';

const app = express();
app.disable('x-powered-by');
registerHealthRoutes(app);
// Render terminates TLS at its trusted reverse proxy.
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
const allowed = clientUrl.split(',').map((s) => s.trim());
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
    // Lets an allowed UI origin calling the API directly (not through /api) send the session cookie.
    credentials: true,
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(
  express.urlencoded({
    extended: false,
    limit: '16kb',
    verify: (req, _res, body) => {
      if (req.url?.split('?')[0] === '/api/payfast/notify')
        payfastItnRaw.set(req, body.toString('utf8'));
    },
  }),
);
// PayFast ITNs must not share shopper request throttling.
// Log only metadata/status; never log signatures or payment payloads.
app.use('/api/payfast/notify', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () =>
    console.info('[payfast:itn] request', {
      method: req.method,
      status: res.statusCode,
      contentType: req.headers['content-type'] || 'missing',
      durationMs: Date.now() - start,
    }),
  );
  next();
});
const shopperLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use('/api', (req, res, next) =>
  req.path === '/payfast/notify' ? next() : shopperLimiter(req, res, next),
);
/* Count real 5xx responses without storing URLs, payloads, IPs or user identities. */
app.use('/api', (_req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) void recordApiError().catch(() => {});
  });
  next();
});
registerCatalogueRoutes(app);
registerAuthRoutes(app);
registerFavoriteRoutes(app);
registerOrderRoutes(app);
registerPayfastRoutes(app);
registerAdminRoutes(app);
registerAiRoutes(app);
registerInsightsRoutes(app);
registerProfileRoutes(app, guard(), identity, demo, (id) =>
  memUsers.find((user) => user.id === id),
);
// Express recognises error handlers by their four parameters, so _next must stay.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  const { status, body } = errorResponse(err);
  if (status >= 500) console.error(err);
  return res.status(status).json(body);
});
const port = Number(process.env.PORT || 10000);
initialize()
  .then(() => {
    setInterval(
      () =>
        expireReservations().catch((err) =>
          console.error('[reservations] expiry sweep failed', err),
        ),
      60_000,
    ).unref();
    app.listen(port, '0.0.0.0', () => console.log('KasiDrop API on :' + port));
  })
  .catch((err) => {
    console.error('Failed to start', err);
    process.exit(1);
  });
