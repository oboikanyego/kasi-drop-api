/** PayFast merchant settings, or null unless every value is set and sandbox mode is selected. */
export function payfastConfig(env: NodeJS.ProcessEnv = process.env) {
  const merchantId = env.PAYFAST_MERCHANT_ID,
    merchantKey = env.PAYFAST_MERCHANT_KEY,
    passphrase = env.PAYFAST_PASSPHRASE;
  // Only the PayFast sandbox is enabled in this release.
  if (!merchantId || !merchantKey || !passphrase || env.PAYFAST_MODE !== 'sandbox') return null;
  return { merchantId, merchantKey, passphrase };
}
export const payfastConfigured = (env: NodeJS.ProcessEnv = process.env) =>
  payfastConfig(env) !== null;
