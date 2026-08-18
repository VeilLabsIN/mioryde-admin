import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy, built per request so it can carry a nonce.
 *
 * ## Why this moved out of next.config
 *
 * A static `script-src 'self'` looks like the strictest possible policy and is
 * actually a broken one: Next's App Router bootstraps hydration and streams
 * the RSC payload through **inline** scripts, and `'self'` does not cover
 * inline. The result was a panel that built cleanly, typechecked, passed every
 * test — and rendered a blank page with a spinner in any browser that enforces
 * CSP, because it never hydrated.
 *
 * A nonce is the fix that keeps the policy strict. It has to be generated per
 * request, which a static config file cannot do, so it lives here.
 *
 * ## Why 'unsafe-inline' is here, which is not a happy answer
 *
 * A per-request nonce is the right fix and was implemented first. Next 16.2.10
 * does not propagate it: with the nonce set on the request's CSP header
 * exactly as documented, the served HTML carried **zero** nonce attributes on
 * its script tags and every inline script was still blocked. Verified against
 * a production build, not just the dev server.
 *
 * So the choice was between an app that does not run and a policy with
 * `'unsafe-inline'` on scripts. Everything else stays locked: no external
 * script origins, no eval in production, nothing framed, no plugins, base-uri
 * pinned, form submissions same-origin. Those still block most of what a CSP
 * is for.
 *
 * **Revisit when Next fixes nonce propagation.** The nonce implementation is
 * in this file's history and is a small revert away.
 */
export function middleware(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";

  // Falls back to same-origin only. A malformed value must not silently widen
  // the policy to everything.
  let apiOrigin = "";
  try {
    apiOrigin = new URL(
      process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000",
    ).origin;
  } catch {
    apiOrigin = "";
  }

  const csp = [
    "default-src 'self'",
    // 'unsafe-inline' is here reluctantly, and it is the weakest line in this
    // policy. See the note at the top of the file.
    //
    // 'unsafe-eval' is development only: the dev server compiles and
    // hot-reloads through eval. A production build never needs it, and
    // shipping it would hand an injected string a way to execute.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind injects styles inline. Nonces do not help here — the framework
    // emits style attributes, not one script tag we can mark.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The API **origin**, not the full URL.
    //
    // A CSP source with a path matches that path exactly unless it ends in a
    // slash, so `http://localhost:3000/v1` blocked every real call —
    // /v1/admin/auth/refresh is not /v1. Origins are what connect-src is for;
    // narrowing to a path prefix buys nothing once the origin is allowed.
    `connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the icons, which are served straight
    // from disk and carry no scripts to police.
    //
    // `icon` and `apple-icon` are the App Router file-convention routes, not
    // files in public/ — the previous list named only favicon.ico, so the tab
    // icon was being handed a full Content-Security-Policy on every request.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
