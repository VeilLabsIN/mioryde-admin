const BASE_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000/v1";

const ACCESS_KEY = "mioryde-admin-access";
const REFRESH_KEY = "mioryde-admin-refresh";

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: "owner" | "ops" | "finance" | "support";
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Token storage.
 *
 * `localStorage` rather than a cookie, deliberately: this panel is a pure
 * client that talks to a separate API origin, so cookies would need
 * `SameSite=None` plus CORS credentials — a broader surface than a bearer
 * token an XSS could steal anyway. The real mitigations are the API's short
 * access-token lifetime and refresh-reuse detection.
 *
 * Wrapped because `localStorage` throws outright in some privacy modes rather
 * than returning null.
 */
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* session-only */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

export const auth = {
  accessToken: () => store.get(ACCESS_KEY),
  refreshToken: () => store.get(REFRESH_KEY),
  save(access: string, refresh: string) {
    store.set(ACCESS_KEY, access);
    store.set(REFRESH_KEY, refresh);
  },
  clear: store.clear,
  isSignedIn: () => store.get(ACCESS_KEY) !== null,
};

/**
 * Collapses concurrent refreshes onto one attempt.
 *
 * The dashboard fires several requests at once. Without this they would each
 * 401 and each start a refresh — and since refresh tokens rotate, the first
 * would succeed and the rest would present an already-spent token, which the
 * API treats as theft and responds to by revoking every session. The user gets
 * silently signed out for loading a page.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const token = auth.refreshToken();
  if (!token) return false;

  try {
    const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    });
    if (!res.ok) {
      auth.clear();
      return false;
    }
    const body = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!body.accessToken || !body.refreshToken) {
      auth.clear();
      return false;
    }
    auth.save(body.accessToken, body.refreshToken);
    return true;
  } catch {
    // Network failure, not an auth failure — keep the tokens so a flaky
    // connection does not sign the user out.
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = auth.accessToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry && auth.refreshToken()) {
    if (await refreshOnce()) return request<T>(path, init, false);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(", ");
      else if (body.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async login(email: string, password: string) {
    const body = await request<{
      accessToken: string;
      refreshToken: string;
      admin: AdminIdentity;
    }>(
      "/admin/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false, // a failed login must not attempt a refresh
    );
    auth.save(body.accessToken, body.refreshToken);
    return body.admin;
  },

  async logout() {
    const token = auth.refreshToken();
    auth.clear();
    if (!token) return;
    try {
      await fetch(`${BASE_URL}/admin/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });
    } catch {
      // Local sign-out already happened; the server session expires on its own.
    }
  },

  me: () => request<AdminIdentity>("/admin/auth/me"),

  overview: () =>
    request<{
      customers: number;
      riders: number;
      ridersPendingKyc: number;
      orders: {
        total: number;
        active: number;
        delivered: number;
        cancelled: number;
        last24h: number;
      };
      revenueDelivered: { minor: number; currency: string };
      outboxPending: number;
    }>("/admin/overview"),

  orders: (params: { page?: number; status?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<{ results: AdminOrder[] }>(
      `/admin/orders${qs ? `?${qs}` : ""}`,
    );
  },

  customers: (params: { page?: number; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<{ results: AdminCustomer[] }>(
      `/admin/customers${qs ? `?${qs}` : ""}`,
    );
  },

  riders: (params: { page?: number; status?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<{ results: AdminRider[] }>(
      `/admin/riders${qs ? `?${qs}` : ""}`,
    );
  },

  reviewRider: (id: string, action: string, note?: string) =>
    request<{ status: string }>(`/admin/riders/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action, ...(note ? { note } : {}) }),
    }),

  rateCards: () => request<{ results: RateCard[] }>("/admin/rate-cards"),
  zones: () => request<{ results: Zone[] }>("/admin/zones"),
  auditLog: () => request<{ results: AuditEntry[] }>("/admin/audit-log"),
};

export interface AdminRider {
  id: string;
  name: string;
  phone: string;
  status: string;
  isOnline: boolean;
  commissionPct: number;
  rating: number | null;
  joinedAt: string;
  completed: number;
  cancelled: number;
  vehicles: string;
  zones: string;
}

export interface RateCard {
  id: string;
  zone: { id: string; name: string; city: string };
  vehicle: { id: string; name: string; code: string };
  baseFare: { minor: number; currency: string };
  perKm: { minor: number; currency: string };
  perMinute: { minor: number; currency: string };
  minFare: { minor: number; currency: string };
  includedKm: number;
  gstPercent: number;
  effectiveFrom: string;
}

export interface Zone {
  id: string;
  name: string;
  city: string;
  isActive: boolean;
  riders: number;
  orders: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  admin: string;
  at: string;
}

export interface AdminOrder {
  id: string;
  code: string;
  status: string;
  total: { minor: number; currency: string };
  placedAt: string;
  customer: { name: string; phone: string };
  pickupAddress: string;
  dropAddress: string;
  vehicleName: string;
  riderName: string | null;
}

export interface AdminCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  createdAt: string;
  orderCount: number;
}

/**
 * Formats minor units for display.
 *
 * Takes `{minor, currency}` straight from the API and never does arithmetic on
 * a float — same rule as the server and the mobile app. `en-IN` gives lakh
 * grouping (₹1,25,000), which is what an Indian operator expects to read.
 */
export function formatMoney(
  amount: { minor: number; currency: string },
  options: { alwaysShowDecimals?: boolean } = {},
): string {
  const whole = amount.minor % 100 === 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: amount.currency,
    minimumFractionDigits: whole && !options.alwaysShowDecimals ? 0 : 2,
    maximumFractionDigits: whole && !options.alwaysShowDecimals ? 0 : 2,
  }).format(amount.minor / 100);
}
