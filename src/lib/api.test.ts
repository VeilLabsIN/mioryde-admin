import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, auth } from "./api";

/**
 * A `fetch` that answers from a scripted queue and records what it was asked.
 *
 * Scripted rather than pattern-matched: the sequence *is* the thing under test.
 * "401, then a successful refresh, then the retry" is a specific order, and a
 * matcher keyed on URL would pass whether or not the retry ever happened.
 */
function scriptFetch(
  responses: Array<{ status: number; body?: unknown }>,
): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;

  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses[i++] ?? { status: 500 };
    return Promise.resolve({
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: () => Promise.resolve(next.body ?? {}),
    } as Response);
  });

  return { calls };
}

describe("admin API client", () => {
  beforeEach(() => {
    // The access token is module-level state, so it survives between tests
    // unless cleared. A leaked token from an earlier case would make a later
    // "signed out" assertion pass for the wrong reason.
    auth.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("token handling", () => {
    it("sends the access token as a bearer header", async () => {
      auth.set("access-1");
      const { calls } = scriptFetch([{ status: 200, body: { results: [] } }]);

      await api.zones();

      const headers = calls[0]?.init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer access-1");
    });

    it("omits the header entirely when signed out", async () => {
      const { calls } = scriptFetch([{ status: 200, body: { results: [] } }]);

      await api.zones();

      const headers = calls[0]?.init?.headers as Record<string, string>;
      // Not "Bearer null" or "Bearer undefined" — either would be sent and
      // rejected, turning a clean 401 into a confusing one.
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe("refreshing an expired session", () => {
    it("refreshes on a 401 and retries the original request once", async () => {
      auth.set("stale");
      const { calls } = scriptFetch([
        { status: 401 },
        {
          status: 200,
          body: { accessToken: "access-2", refreshToken: "refresh-2" },
        },
        { status: 200, body: { results: ["ok"] } },
      ]);

      const result = await api.zones();

      expect(result.results).toEqual(["ok"]);
      expect(calls).toHaveLength(3);
      expect(calls[1]?.url).toContain("/admin/auth/refresh");
      // The retry carries the *new* token. Retrying with the stale one would
      // 401 again and look like a broken refresh.
      expect(
        (calls[2]?.init?.headers as Record<string, string>).Authorization,
      ).toBe("Bearer access-2");
      expect(auth.accessToken()).toBe("access-2");
    });

    it("does not retry a second time, so a persistent 401 cannot loop", async () => {
      auth.set("stale");
      const { calls } = scriptFetch([
        { status: 401 },
        {
          status: 200,
          body: { accessToken: "access-2", refreshToken: "refresh-2" },
        },
        { status: 401 },
      ]);

      await expect(api.zones()).rejects.toBeInstanceOf(ApiError);
      expect(calls).toHaveLength(3);
    });

    it("collapses concurrent 401s onto a single refresh", async () => {
      // The dashboard fires several requests at once. Without collapsing, each
      // would start its own refresh; since refresh tokens rotate, the first
      // succeeds and the rest present an already-spent token — which the API
      // treats as theft and answers by revoking every session. The operator is
      // signed out for the crime of loading a page.
      auth.set("stale");
      const { calls } = scriptFetch([
        { status: 401 },
        { status: 401 },
        { status: 401 },
        {
          status: 200,
          body: { accessToken: "access-2", refreshToken: "refresh-2" },
        },
        { status: 200, body: { results: [] } },
        { status: 200, body: { results: [] } },
        { status: 200, body: { results: [] } },
      ]);

      await Promise.all([api.zones(), api.zones(), api.zones()]);

      const refreshCalls = calls.filter((c) =>
        c.url.includes("/admin/auth/refresh"),
      );
      expect(refreshCalls).toHaveLength(1);
    });

    it("clears tokens when the refresh itself is rejected", async () => {
      auth.set("stale");
      scriptFetch([{ status: 401 }, { status: 401 }]);

      await expect(api.zones()).rejects.toBeInstanceOf(ApiError);
      expect(auth.hasAccessToken()).toBe(false);
    });

    it("keeps tokens when the refresh fails on the network", async () => {
      // A flaky connection is not an authentication failure. Clearing here
      // would sign an operator out mid-payout for a dropped packet.
      auth.set("stale");
      let call = 0;
      vi.stubGlobal("fetch", () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.reject(new TypeError("Failed to fetch"));
      });

      await expect(api.zones()).rejects.toBeInstanceOf(ApiError);
      expect(auth.hasAccessToken()).toBe(true);
    });

    it("attempts a refresh even holding no token, because it cannot know", async () => {
      // The refresh token is an HttpOnly cookie this code cannot read, so
      // "do I have a session?" is unanswerable locally. Trying is the only way
      // to find out, and a failed attempt costs one cheap 401.
      const { calls } = scriptFetch([{ status: 401 }, { status: 401 }]);

      await expect(api.zones()).rejects.toBeInstanceOf(ApiError);
      expect(calls.some((c) => c.url.includes("/admin/auth/refresh"))).toBe(true);
    });
  });

  describe("error surfacing", () => {
    it("uses the server's message so the operator sees the real reason", async () => {
      auth.set("a");
      scriptFetch([
        { status: 409, body: { message: "That payout is already settled." } },
      ]);

      await expect(api.zones()).rejects.toMatchObject({
        status: 409,
        message: "That payout is already settled.",
      });
    });

    it("joins the array of messages class-validator returns", async () => {
      auth.set("a");
      scriptFetch([
        {
          status: 400,
          body: { message: ["reference is required", "amount must be positive"] },
        },
      ]);

      await expect(api.zones()).rejects.toMatchObject({
        message: "reference is required, amount must be positive",
      });
    });

    it("falls back to the status when the body is not JSON", async () => {
      auth.set("a");
      vi.stubGlobal("fetch", () =>
        Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.reject(new SyntaxError("not json")),
        } as unknown as Response),
      );

      // A gateway returning an HTML error page must not become "undefined".
      await expect(api.zones()).rejects.toMatchObject({
        status: 502,
        message: "Request failed (502)",
      });
    });
  });
  describe("the credential never becomes durable", () => {
    it("writes nothing to localStorage on sign-in", async () => {
      // The regression this guards: an admin token in localStorage is readable
      // by any script on the page and outlives the tab. Moving it into memory
      // is the entire point of the cookie change, and a well-meaning "remember
      // me" would quietly undo it.
      const written: string[] = [];
      vi.stubGlobal("localStorage", {
        getItem: () => null,
        setItem: (k: string) => void written.push(k),
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      });

      scriptFetch([
        {
          status: 200,
          body: {
            accessToken: "access-1",
            admin: { id: "1", email: "a@b.c", name: "A", role: "owner" },
          },
        },
      ]);

      await api.login("a@b.c", "password");

      expect(written).toEqual([]);
      expect(auth.accessToken()).toBe("access-1");
    });

    it("sends credentials on sign-in so the cookie is stored", async () => {
      const { calls } = scriptFetch([
        {
          status: 200,
          body: {
            accessToken: "access-1",
            admin: { id: "1", email: "a@b.c", name: "A", role: "owner" },
          },
        },
      ]);

      await api.login("a@b.c", "password");

      // Without this the browser discards the Set-Cookie and the session dies
      // at the first reload — a bug that looks like "it logs me out randomly".
      expect(calls[0]?.init?.credentials).toBe("include");
    });
  });

  describe("restoreSession", () => {
    it("returns the identity when the cookie still works", async () => {
      const identity = { id: "1", email: "a@b.c", name: "A", role: "owner" };
      scriptFetch([
        { status: 200, body: { accessToken: "access-2" } },
        { status: 200, body: identity },
      ]);

      await expect(api.restoreSession()).resolves.toEqual(identity);
      expect(auth.accessToken()).toBe("access-2");
    });

    it("returns null rather than throwing when there is no session", async () => {
      // A first visit is not an error. Throwing here would surface a red
      // banner on the login screen of someone who has simply never signed in.
      scriptFetch([{ status: 401 }]);
      await expect(api.restoreSession()).resolves.toBeNull();
    });

    it("clears the token when the identity call is rejected", async () => {
      // Refresh succeeded but /me did not — a deactivated account, or a role
      // narrowed to nothing. Keeping the token would leave the panel half
      // signed-in.
      scriptFetch([
        { status: 200, body: { accessToken: "access-2" } },
        { status: 403 },
      ]);

      await expect(api.restoreSession()).resolves.toBeNull();
      expect(auth.hasAccessToken()).toBe(false);
    });
  });
});
