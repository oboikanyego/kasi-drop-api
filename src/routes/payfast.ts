import type { Express } from 'express';
import { verifyPayfastItn } from '../payfast-signature.js';
import { HttpError } from '../http-error.js';
import { needsReview, paymentTransition } from '../reservations.js';
import { applyTransition, getOrder } from '../order-store.js';
import { safe } from '../http.js';

/** Raw ITN form bodies, captured by the urlencoded parser in server.ts for signature checks. */
export const payfastItnRaw = new WeakMap<object, string>();

export function registerPayfastRoutes(app: Express) {
  app.post(
    '/api/payfast/notify',
    safe(async (req, res) => {
      const reject = (reason: string, status = 400) => {
        console.warn('[payfast:itn] rejected', reason);
        return res.sendStatus(status);
      };
      if (process.env.PAYFAST_MODE !== 'sandbox' || !process.env.PAYFAST_PASSPHRASE)
        return reject('sandbox_configuration', 403);
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        return reject('missing_or_unsupported_body');
      const fields: Record<string, string> = Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [k, String(v)]),
      );
      if (!/^[a-f0-9]{32}$/i.test(fields.signature || ''))
        return reject('missing_or_malformed_signature');
      const rawItn = payfastItnRaw.get(req);
      if (!rawItn) return reject('missing_raw_itn_body');
      if (!verifyPayfastItn(rawItn, process.env.PAYFAST_PASSPHRASE || ''))
        return reject('signature_mismatch');
      const order = await getOrder(fields.m_payment_id || '');
      if (!order || order.demoSeed) return reject('order_not_found_or_test_fixture');
      if (fields.merchant_id !== process.env.PAYFAST_MERCHANT_ID)
        return reject('merchant_mismatch');
      if (
        !Number.isFinite(Number(fields.amount_gross)) ||
        Math.round(Number(fields.amount_gross) * 100) !== Math.round(order.total * 100)
      )
        return reject('amount_mismatch');
      // Do not mark orders paid unless the transaction is independently confirmed.
      const validation = new URLSearchParams(fields);
      let remote: globalThis.Response;
      try {
        remote = await fetch('https://sandbox.payfast.co.za/eng/query/validate', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: validation.toString(),
          signal: AbortSignal.timeout(12000),
        });
      } catch (err) {
        console.error(
          '[payfast:itn] confirmation_unavailable',
          err instanceof Error ? err.name : 'network_error',
        );
        return res.sendStatus(503);
      }
      if (!remote.ok) return reject('confirmation_http_' + remote.status);
      if ((await remote.text()).trim() !== 'VALID') return reject('confirmation_invalid');
      const transition = paymentTransition(order, fields.payment_status || '');
      if (!transition) return res.sendStatus(200);
      try {
        // A conflict means another ITN or the expiry sweep changed the order first; PayFast retries non-200s.
        if (!(await applyTransition(order, transition))) return reject('order_changed_retry', 503);
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 409)) throw err;
        // Paid after the reservation expired, and the stock has since sold.
        if (!(await applyTransition(order, needsReview())))
          return reject('order_changed_retry', 503);
        return reject('fulfilment_requires_review', 500);
      }
      console.info('[payfast:itn] verified', {
        paymentStatus: fields.payment_status,
        orderUpdated: true,
      });
      return res.sendStatus(200);
    }),
  );
}
