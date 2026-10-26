import mongoose from 'mongoose';
import type { Express } from 'express';

export function readinessStatus(demoMode: boolean, mongoReadyState: number) {
  return demoMode || mongoReadyState === 1 ? 200 : 503;
}

export function registerHealthRoutes(app: Express) {
  // Liveness: no network or database dependency; suitable for infrastructure probes.
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', service: 'kasi-drop-api', uptime: process.uptime() });
  });

  // Readiness: reflects the current MongoDB driver connection state in persistent mode.
  app.get('/api/health', (_req, res) => {
    const status = readinessStatus(
      process.env.DEMO_MODE === 'true',
      mongoose.connection.readyState,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({
      status: status === 200 ? 'ready' : 'not_ready',
      service: 'kasi-drop-api',
      database:
        process.env.DEMO_MODE === 'true' ? 'demo' : status === 200 ? 'connected' : 'disconnected',
    });
  });
}
