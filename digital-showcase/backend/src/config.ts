import crypto from "node:crypto";

const EXAMPLE_SECRET = "replace-with-at-least-32-random-characters";
let devSecret: string | null = null;

/**
 * Key that signs sessions. In production a real one (32+ characters) is
 * required and the server refuses to start without it; it is never printed.
 * In development a missing key is replaced by a random one (sessions reset on restart).
 */
export function jwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret !== EXAMPLE_SECRET && (secret.length >= 32 || process.env.NODE_ENV !== "production")) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set to at least 32 random characters (openssl rand -hex 32)");
  if (!devSecret) {
    devSecret = crypto.randomBytes(32).toString("hex");
    console.warn("JWT_SECRET is not set: using a random key, sessions end when the server restarts");
  }
  return devSecret;
}

/** Stops a production start with an unsafe configuration, before anything listens. */
export function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  jwtSecret();
}

/**
 * How many proxies stand in front (nginx = 1), so req.ip is the buyer's
 * address and can't be faked with an X-Forwarded-For header. TRUST_PROXY
 * accepts a number, "false", or Express's list syntax ("loopback, uniquelocal").
 */
export function trustProxy(): boolean | number | string {
  const value = process.env.TRUST_PROXY?.trim();
  if (!value) return 1;
  if (value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}
