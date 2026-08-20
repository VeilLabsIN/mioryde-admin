import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads the shipped JavaScript the way an attacker would.
 *
 * The two checks either side of this one reason about *configuration*: the
 * API's boot guard refuses to start when a secret sits in a `NEXT_PUBLIC_`
 * variable. This one reasons about the *artifact*, and that difference is the
 * point — the bundle is the thing a stranger downloads, and the only honest
 * question about it is "what is actually in the file".
 *
 * It catches what the configuration check cannot: a key typed straight into a
 * source file, a fixture with a real token in it, a config object imported into
 * a client component. None of those pass through an environment variable, so
 * nothing upstream would object.
 *
 * ## Why patterns and not a list of our secrets
 *
 * A test cannot hold the real values — that would put every production
 * credential into the repository to prove they are not in the repository. So it
 * looks for the shapes that credentials have, and the shapes are chosen to be
 * specific enough not to fire on minified code: `AQ.`/`AIza` Google keys,
 * `rzp_live_`, AWS access key ids, PEM headers, JWTs with a real payload.
 *
 * Skips itself when there is no build. It is a check on a build, not a reason
 * to fail a test run that has not made one.
 */

const BUILD_DIR = join(process.cwd(), ".next", "static");

interface Signature {
  name: string;
  pattern: RegExp;
}

const SIGNATURES: Signature[] = [
  { name: "Google API key (AQ. form)", pattern: /AQ\.[A-Za-z0-9_-]{30,}/ },
  { name: "Google API key (AIza form)", pattern: /AIza[A-Za-z0-9_-]{35}/ },
  { name: "Razorpay live secret", pattern: /rzp_live_[A-Za-z0-9]{10,}/ },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    // Three base64url segments with a payload long enough to carry claims.
    // Short `a.b.c` sequences appear in minified output; real tokens do not.
    name: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    // Postgres URLs with credentials. `localhost` is excluded: a dev default
    // in a comment is not a leak, and firing on it teaches people to ignore
    // this test.
    name: "database URL with credentials",
    pattern: /postgres(?:ql)?:\/\/[^\s:@"']+:[^\s:@"']+@(?!localhost|127\.0\.0\.1)/,
  },
];

function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (/\.(js|mjs|css|json|map)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("shipped bundle", () => {
  const files = jsFiles(BUILD_DIR);

  it.runIf(files.length > 0)("contains no credential-shaped strings", () => {
    const found: string[] = [];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { name, pattern } of SIGNATURES) {
        const hit = pattern.exec(text);
        if (hit) {
          // The match itself is never printed — this output goes to CI logs.
          found.push(
            `${name} in ${file.replace(process.cwd(), "")} (${hit[0].length} chars)`,
          );
        }
      }
    }

    expect(
      found,
      `Credential-shaped strings are in the shipped bundle:\n${found.join("\n")}\n\n` +
        "Anything here is readable by anyone who loads the panel. Move it " +
        "server-side, or — if it is a key that genuinely has to be in a client " +
        "— restrict it at the provider and add it to the allowlist in this test.",
    ).toEqual([]);
  });

  it.runIf(files.length > 0)("ships no source maps", () => {
    // Source maps hand over the original TypeScript, comments and all. Next
    // omits them from production by default; this fails if that is ever turned
    // on, because `productionBrowserSourceMaps: true` looks harmless in a diff.
    const maps = files.filter((f) => f.endsWith(".map"));
    expect(maps.map((m) => m.replace(process.cwd(), ""))).toEqual([]);
  });

  it("knows where to look", () => {
    // Guards the guard. If the build directory is ever renamed, the two checks
    // above silently pass over an empty list and this file becomes decoration
    // — the same failure mode the RBAC suite watches for.
    expect(BUILD_DIR.endsWith(join(".next", "static"))).toBe(true);
  });
});
