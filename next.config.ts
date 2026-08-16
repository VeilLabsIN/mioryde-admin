import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * This panel is a more valuable target than the marketing site, not a lesser
 * one: a session here can settle payouts, suspend partners and read every
 * customer's address history. The token lives in memory and the API is on
 * another origin, so the headers that matter are the ones that stop a
 * successful injection from doing anything useful with it.
 */
/**
 * The API's *origin*, which is what `connect-src` matches on.
 *
 * `NEXT_PUBLIC_API_URL` carries a path (`…/v1`) and CSP source expressions
 * match by path prefix, so passing it through unchanged would silently narrow
 * the rule and block any call that ever moves off `/v1`. Parsing to an origin
 * keeps the rule saying what it means.
 */
const apiOrigin = (() => {
  const raw = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000/v1";
  try {
    return new URL(raw).origin;
  } catch {
    // A malformed value must not produce a header that silently allows
    // everything. Fall back to same-origin only and let the panel fail
    // loudly and locally instead.
    return "'self'";
  }
})();

const securityHeaders = [
  // The panel is XHR-only against one known API origin. `connect-src` is the
  // control that matters here — it means injected script cannot exfiltrate an
  // operator's session to an attacker's host, which is the whole point of
  // stealing one.
  //
  // 'unsafe-inline' on styles is Next's requirement for its own style
  // injection. Scripts do not get it.
  {
    key: "X-Content-Security-Policy-Note",
    // The real CSP is built per request in src/middleware.ts, because it
    // carries a nonce and a static file cannot generate one. Keeping a
    // hardcoded copy here as well would guarantee the two drift, and the
    // stricter of two policies wins — so the stale one would quietly break
    // the app. This marker exists only so somebody looking for the CSP here
    // finds a pointer instead of nothing.
    value: "see src/middleware.ts",
  },
  // Redundant alongside frame-ancestors for modern browsers, kept for the
  // older ones that only understand this.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer would otherwise leak panel URLs — which embed rider and order
  // ids — to any external host an operator navigates to.
  { key: "Referrer-Policy", value: "no-referrer" },
  // The panel needs none of these. Denying them means a compromised page
  // cannot quietly turn one on.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const config: NextConfig = {
  // The panel is an internal tool behind a login; it renders nothing publicly
  // and needs no image optimisation pipeline.
  reactStrictMode: true,

  // Removes the `X-Powered-By: Next.js` banner. Version disclosure is not a
  // vulnerability by itself, but it is free reconnaissance.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
