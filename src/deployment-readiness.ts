import { payfastConfigured } from './payfast-config.js';
import { r2Config } from './r2-store.js';

export function deploymentReadiness(env: NodeJS.ProcessEnv = process.env) {
  const demo = env.DEMO_MODE === 'true';
  const origin = env.PUBLIC_API_URL || '';
  const storefront = env.CLIENT_URL || '';
  const paymentMode = env.PAYFAST_MODE || 'unset';
  const issues: string[] = [];
  if (!/^https:\/\//.test(origin)) issues.push('PUBLIC_API_URL must be a public HTTPS API origin for gateway callbacks');
  if (!/^https:\/\//.test(storefront)) issues.push('CLIENT_URL must be a public HTTPS storefront origin');
  if (demo) issues.push('DEMO_MODE is enabled: data and orders are temporary');
  if (paymentMode !== 'sandbox') issues.push('Only PayFast sandbox is supported; live payments are disabled');
  if (!payfastConfigured(env)) issues.push('PayFast sandbox credentials are missing or invalid');
  if (!demo && (!env.MONGODB_URI || !env.MONGODB_DB_NAME || !env.JWT_SECRET)) issues.push('Persistent database/auth configuration is incomplete');
  let imageStorage = 'mongodb';
  try { imageStorage = r2Config(env) ? 'r2' : 'mongodb'; }
  catch { issues.push('Cloudflare R2 settings are incomplete'); imageStorage = 'misconfigured'; }
  return {
    deployable: issues.filter(x => !x.startsWith('Only PayFast')).length === 0,
    acceptsRealPayments: false,
    gateway: 'payfast',
    gatewayMode: paymentMode,
    sandboxReady: payfastConfigured(env),
    databaseMode: demo ? 'demo' : 'persistent',
    imageStorage,
    callbackOriginMatchesConfiguredUrl: origin.startsWith('https://'),
    issues,
  };
}
