import type { Role } from "../types/models";

/** Query parameter on /login that holds the page the user was heading to. */
const NEXT_PARAM = "next";

export function defaultPathForRole(role: Role) {
  return role === "ADMIN" ? "/admin" : "/dashboard";
}

/** /login link that brings the user back to `path` (pathname + search + hash) after signing in. */
export function loginUrl(path: string) {
  return `/login?${new URLSearchParams({ [NEXT_PARAM]: path })}`;
}

/**
 * Only same-site paths: starts with a single "/", no scheme or protocol-relative
 * "//host" (also "/\host", which browsers treat the same way), no control chars.
 */
function isInternalPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return false;
  if (/[\u0000-\u001f]/.test(path)) return false;
  try {
    return new URL(path, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

function fitsRole(path: string, role: Role) {
  const pathname = path.split(/[?#]/)[0];
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (under("/login") || under("/logout")) return false;
  if (under("/admin")) return role === "ADMIN";
  if (under("/dashboard")) return role === "OWNER";
  return true;
}

/** Where to go after signing in: the saved `next` if it is safe and fits the role, else the role's home. */
export function pathAfterLogin(search: string, role: Role) {
  const next = new URLSearchParams(search).get(NEXT_PARAM);
  if (next && isInternalPath(next) && fitsRole(next, role)) return next;
  return defaultPathForRole(role);
}
