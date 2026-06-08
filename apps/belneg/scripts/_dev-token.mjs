// Dev-only: mints a JWT for the seeded E2E test user.
// Usage: node scripts/_dev-token.mjs
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2]; }

const t = await new SignJWT({ sub: "usr_e2etest", role: "KODIM", unit_id: "KODIM-025", email: "e2e@test.dev" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer("belneg-api").setAudience("pembina-kkri-app")
  .setIssuedAt().setExpirationTime("30d")
  .sign(new TextEncoder().encode(process.env.JWT_SECRET));
console.log(t);
