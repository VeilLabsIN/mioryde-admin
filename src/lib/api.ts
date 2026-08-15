const BASE_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000/v1";

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
 * Session state.
 *
 * The access token lives **in memory only** and the refresh token is an
 * HttpOnly cookie the browser holds and this code can never read. Both halves
 * of that matter:
 *
 *   - Nothing durable is in `localStorage`, so a script injected into the page
 *     cannot walk away with a credential that outlives the tab. It can still
 *     act as the operator while the tab is open — that is XSS, and no storage
 *     choice fixes it — but the sixty-day refresh token is out of reach.
 *   - The access token stays a bearer *header*. A cross-origin page cannot set
 *     one, so every route except refresh is immune to CSRF by construction.
 *
 * The cost is that a page reload loses the access token. `restoreSession`
 * below trades the cookie for a new one at startup, which is why signing in is
 * not lost on refresh.
 */
let accessToken: string | null = null;

export const auth = {
  accessToken: () => accessToken,
  set(token: string) {
    accessToken = token;
  },
  clear() {
    accessToken = null;
  },
  /**
   * Whether this tab currently holds a usable token.
   *
   * Deliberately *not* a claim about whether the operator has a session: the
   * cookie may still be valid after a reload while this is false. Callers that
   * need the real answer must await `restoreSession`.
   */
  hasAccessToken: () => accessToken !== null,
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
  try {
    const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
      method: "POST",
      // Sends the HttpOnly cookie. Without this the browser omits it and every
      // refresh fails with a 401 that looks like an expired session.
      credentials: "include",
    });

    if (!res.ok) {
      // 401 here means the cookie is missing, spent or revoked — a real
      // sign-out. Anything else is the server having a bad day, and dropping
      // the in-memory token for that would sign an operator out mid-task.
      if (res.status === 401) auth.clear();
      return false;
    }

    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) {
      auth.clear();
      return false;
    }

    auth.set(body.accessToken);
    return true;
  } catch {
    // Network failure, not an auth failure. Keep whatever token we have so a
    // dropped packet does not end the session.
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

  if (res.status === 401 && retry) {
    // No longer gated on holding a refresh token: it is an HttpOnly cookie now
    // and this code cannot see whether one exists. Attempting the refresh is
    // the only way to find out, and a failed attempt is a cheap 401.
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
      admin: AdminIdentity;
    }>(
      "/admin/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
        // The response sets the refresh cookie; without this the browser
        // discards it and the session dies at the first reload.
        credentials: "include",
      },
      false, // a failed login must not attempt a refresh
    );
    auth.set(body.accessToken);
    return body.admin;
  },

  async logout() {
    // Cleared first so the UI cannot keep using the token while the request is
    // in flight, and so a failed request still signs the operator out locally.
    auth.clear();
    try {
      await fetch(`${BASE_URL}/admin/auth/logout`, {
        method: "POST",
        // Carries the cookie, which is the only thing identifying the session
        // to revoke, and lets the server clear it.
        credentials: "include",
      });
    } catch {
      // Local sign-out already happened; the server session expires on its own.
    }
  },

  /**
   * Rebuilds the session after a page load.
   *
   * The access token is in memory, so a reload starts with nothing. The refresh
   * cookie survives, and trading it for a fresh access token is what makes a
   * reload feel like staying signed in rather than being logged out.
   *
   * Returns the identity on success and null when there is no usable session —
   * the caller routes to login rather than treating it as an error, because
   * "not signed in" is the ordinary case on a first visit.
   */
  async restoreSession(): Promise<AdminIdentity | null> {
    if (!auth.hasAccessToken() && !(await refreshOnce())) return null;

    try {
      return await request<AdminIdentity>("/admin/auth/me");
    } catch {
      auth.clear();
      return null;
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
  auditLog: (
    params: { page?: number; action?: string; subjectId?: string } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.action) query.set("action", params.action);
    if (params.subjectId) query.set("subjectId", params.subjectId);
    const qs = query.toString();
    return request<{ results: AuditEntry[] }>(
      `/admin/audit-log${qs ? `?${qs}` : ""}`,
    );
  },

  /** Distinct actions present in the log, for the filter control. */
  auditActions: () => request<{ results: string[] }>("/admin/audit-log/actions"),

  riderById: (id: string) => request<RiderDetail>(`/admin/riders/${id}`),

  /**
   * Trades a masked number for the real one, and is recorded doing it.
   *
   * The server writes an audit row naming the operator, the time, the address
   * and the reason. Nothing about that is enforced here — the panel cannot
   * choose not to be logged, which is the property that makes the log worth
   * having.
   */
  revealRiderPhone: (id: string, reason?: string) =>
    request<{ phone: string }>(`/admin/riders/${id}/reveal-phone`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),

  payouts: (params: { page?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return request<{ results: Payout[]; pending: PayoutTotals }>(
      `/admin/payouts${qs ? `?${qs}` : ""}`,
    );
  },

  settlePayout: (
    id: string,
    action: "start" | "paid" | "reject",
    options: { reference?: string; note?: string } = {},
  ) =>
    request<{ status: string }>(`/admin/payouts/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ action, ...options }),
    }),

  // ── KYC ────────────────────────────────────────────────────────────────────

  kycQueue: (page = 0) =>
    request<{ results: KycQueueItem[] }>(`/admin/kyc/queue?page=${page}`),

  /** Documents a first reviewer approved, waiting on a second (§4.10). */
  kycCountersignQueue: (page = 0) =>
    request<{ results: CountersignItem[] }>(
      `/admin/kyc/countersign?page=${page}`,
    ),

  /**
   * A short-lived link to look at one document.
   *
   * POST for a read because it records an access. A GET could be prefetched by
   * the browser, manufacturing audit entries for documents nobody opened —
   * poisoning the record the endpoint exists to create.
   */
  viewKycDocument: (id: string) =>
    request<{ url: string; expiresInSeconds: number }>(
      `/admin/kyc/documents/${id}/view`,
      { method: "POST" },
    ),

  reviewKycDocument: (
    id: string,
    decision: "approve" | "reject",
    options: { rejectCode?: string; note?: string } = {},
  ) =>
    request<{ status: string; awaitingSecondSignature?: boolean }>(
      `/admin/kyc/documents/${id}/review`,
      { method: "POST", body: JSON.stringify({ decision, ...options }) },
    ),

  countersignKycDocument: (
    id: string,
    decision: "approve" | "reject",
    options: { rejectCode?: string; note?: string } = {},
  ) =>
    request<{ status: string }>(`/admin/kyc/documents/${id}/countersign`, {
      method: "POST",
      body: JSON.stringify({ decision, ...options }),
    }),

  pendingVehicles: (page = 0) =>
    request<{ results: PendingVehicle[] }>(`/admin/vehicles/pending?page=${page}`),

  reviewVehicle: (
    id: string,
    riderId: string,
    decision: "approve" | "reject",
    note?: string,
  ) =>
    request<{ status: string }>(`/admin/vehicles/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ riderId, decision, ...(note ? { note } : {}) }),
    }),
};

export interface KycQueueItem {
  id: string;
  kind: string;
  label: string;
  status: string;
  riderId: string;
  riderName: string;
  riderStage: string;
  uploadedAt: string;
  expiresAt: string | null;
}

export interface CountersignItem {
  id: string;
  kind: string;
  label: string;
  riderId: string;
  riderName: string;
  firstReviewerName: string | null;
  firstReviewedAt: string;
}

export interface PendingVehicle {
  vehicleId: string;
  registrationNumber: string;
  vehicleType: string;
  make: string | null;
  model: string | null;
  isThirdParty: boolean;
  ownerName: string | null;
  riderId: string;
  riderName: string;
  approvedDocuments: number;
  addedAt: string;
}

export interface Payout {
  id: string;
  rider: {
    id: string;
    name: string;
    phone: string;
    /** Lifetime earned, for context on whether a request looks reasonable. */
    lifetimeEarned: { minor: number; currency: string };
  };
  amount: { minor: number; currency: string };
  status: "requested" | "processing" | "paid" | "rejected";
  /** Bank or UPI reference, once the transfer has been made. */
  reference: string | null;
  note: string | null;
  requestedAt: string;
  settledAt: string | null;
}

export interface PayoutTotals {
  total: { minor: number; currency: string };
  count: number;
}

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

export interface RiderDetail {
  id: string;
  name: string;
  phone: string;
  status: string;
  isOnline: boolean;
  commissionPct: number;
  rating: number | null;
  joinedAt: string;
  /** Whether bank details exist. Never the details — they are encrypted at
   * rest and an operator has no reason to read a partner's account number. */
  hasBankDetails: boolean;
  completed: number;
  cancelled: number;
  earnings: { minor: number; currency: string };
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
