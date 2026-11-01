// Generates the "client secret" Supabase needs for Sign in with Apple (web). It expires after 6 months
// (Apple's maximum), so run this again before then and paste the result into Supabase → Auth → Providers → Apple.
// Usage: node scripts/apple-client-secret.js <path-to-AuthKey.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>
// The secret is written to stdout; pipe it to pbcopy so it never shows on screen.
const fs = require('fs');
const { importPKCS8, SignJWT } = require('jose');

const [p8Path, keyId, teamId, servicesId] = process.argv.slice(2);
if (!p8Path || !keyId || !teamId || !servicesId) {
  console.error('usage: node scripts/apple-client-secret.js <AuthKey.p8> <KEY_ID> <TEAM_ID> <SERVICES_ID>');
  process.exit(1);
}
const SIX_MONTHS = 180 * 24 * 3600;

(async () => {
  const key = await importPKCS8(fs.readFileSync(p8Path, 'utf8'), 'ES256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId).setSubject(servicesId).setAudience('https://appleid.apple.com')
    .setIssuedAt(now).setExpirationTime(now + SIX_MONTHS)
    .sign(key);
  process.stdout.write(jwt);
  console.error(`\nApple client secret for ${servicesId} expires ${new Date((now + SIX_MONTHS) * 1000).toISOString().slice(0, 10)}`);
})();
