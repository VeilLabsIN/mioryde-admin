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
  /**
   * @param rememberMe Keeps the session for a week instead of a day. The
   * server decides both figures and defaults to the shorter one, so passing
   * nothing is the safe call rather than the long one.
   */
  async login(email: string, password: string, rememberMe = false) {
    const body = await request<{
      accessToken: string;
      admin: AdminIdentity;
    }>(
      "/admin/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password, rememberMe }),
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
    return request<Paged<AdminOrder>>(
      `/admin/orders${qs ? `?${qs}` : ""}`,
    );
  },

  /**
   * Everything in flight, for the dispatch board.
   *
   * No paging parameter, because the endpoint has none — a board showing half
   * the city would be worse than no board. See `truncated` on the response.
   */
  liveOrders: () => request<LiveOrdersResponse>("/admin/orders/live"),

  customers: (params: { page?: number; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<Paged<AdminCustomer>>(
      `/admin/customers${qs ? `?${qs}` : ""}`,
    );
  },

  riders: (params: { page?: number; status?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<Paged<AdminRider>>(
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
  vehicleTypes: () =>
    request<{ results: VehicleType[] }>("/admin/vehicle-types"),

  /**
   * Publishes a new rate card for a zone and vehicle.
   *
   * Supersedes rather than edits — the server closes the live card and inserts
   * a new one — so past orders keep the price they were charged. Finance and
   * owner only.
   */
  publishRateCard: (input: RateCardInput) =>
    request<{ id: string }>("/admin/rate-cards", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * What one trip would cost under amounts that have not been published.
   *
   * A POST because it carries a body, not because it changes anything: the
   * server reads nothing and writes nothing. The arithmetic is deliberately
   * left there — doing it here would mean a second implementation of the fare
   * formula, drifting silently from the one that actually charges customers.
   */
  previewFare: (input: FarePreviewInput) =>
    request<FarePreview>("/admin/rate-cards/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  auditLog: (
    params: { page?: number; action?: string; subjectId?: string } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.action) query.set("action", params.action);
    if (params.subjectId) query.set("subjectId", params.subjectId);
    const qs = query.toString();
    return request<Paged<AuditEntry>>(
      `/admin/audit-log${qs ? `?${qs}` : ""}`,
    );
  },

  /** Distinct actions present in the log, for the filter control. */
  auditActions: () => request<{ results: string[] }>("/admin/audit-log/actions"),

  /** A partner's last fifty deliveries. Capped, not paged — see the API. */
  riderOrders: (id: string) =>
    request<{ results: RiderTrip[] }>(`/admin/riders/${id}/orders`),

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
    return request<Paged<Payout> & { pending: PayoutTotals }>(
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
    request<Paged<KycQueueItem>>(`/admin/kyc/queue?page=${page}`),

  /** Documents a first reviewer approved, waiting on a second (§4.10). */
  kycCountersignQueue: (page = 0) =>
    request<Paged<CountersignItem>>(
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

  // ── Analytics ──────────────────────────────────────────────────────────────

  analytics: (range: { days?: number; from?: string; to?: string } = {}) => {
    const query = new URLSearchParams();
    // from/to win on the server too when both are present; sending only what
    // was chosen keeps the request readable in a network log.
    if (range.from && range.to) {
      query.set("from", range.from);
      query.set("to", range.to);
    } else {
      query.set("days", String(range.days ?? 30));
    }
    return request<Analytics>(`/admin/analytics?${query}`);
  },

  /**
   * Downloads the daily series as a CSV.
   *
   * Fetched with the bearer token and handed to the browser as a blob rather
   * than linked directly: a plain `<a href>` sends no Authorization header, so
   * the endpoint would answer 401 and the browser would save the error body as
   * a file called `daily.csv`. Failing loudly here is the whole point.
   */
  downloadDailyCsv(range: { days?: number; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    if (range.from && range.to) {
      query.set("from", range.from);
      query.set("to", range.to);
    } else {
      query.set("days", String(range.days ?? 30));
    }

    return downloadCsv(`/admin/analytics/daily.csv?${query}`);
  },

  /** Every partner who delivered in the period, not just the top fifteen. */
  downloadPartnersCsv(range: { days?: number; from?: string; to?: string } = {}) {
    const query = new URLSearchParams();
    if (range.from && range.to) {
      query.set("from", range.from);
      query.set("to", range.to);
    } else {
      query.set("days", String(range.days ?? 30));
    }
    return downloadCsv(`/admin/analytics/partners.csv?${query}`);
  },

  /** The payout queue, narrowed to the same status the screen is showing. */
  downloadPayoutsCsv(status?: string) {
    return downloadCsv(
      `/admin/payouts.csv${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
  },

  /** Partners holding cash. */
  downloadCollectionsCsv() {
    return downloadCsv("/admin/cash/outstanding.csv");
  },

  /** The audit log, carrying whichever filters the screen has applied. */
  downloadAuditCsv(filters: { action?: string; subjectId?: string } = {}) {
    const query = new URLSearchParams();
    if (filters.action) query.set("action", filters.action);
    if (filters.subjectId) query.set("subjectId", filters.subjectId);
    const qs = query.toString();
    return downloadCsv(`/admin/audit-log.csv${qs ? `?${qs}` : ""}`);
  },

  // ── Partner agreement ──────────────────────────────────────────────────────

  currentAgreement: () => request<Agreement>("/admin/agreement"),

  publishAgreement: (body: {
    version: string;
    title: string;
    body: string;
    effectiveFrom?: string;
  }) =>
    request<{
      version: string;
      contentHash: string;
      /** Partners stood down because they signed the previous version. */
      ridersTakenOffline: number;
    }>("/admin/agreement", { method: "POST", body: JSON.stringify(body) }),

  // ── Cash collections ───────────────────────────────────────────────────────

  outstandingCash: (page = 0) =>
    request<Paged<OutstandingCash>>(`/admin/cash/outstanding?page=${page}`),

  recordCashDeposit: (
    riderId: string,
    body: { amount: number; method: string; reference?: string; note?: string },
  ) =>
    request<{
      credited: { minor: number; currency: string };
      stillHeld: { minor: number; currency: string };
    }>(`/admin/cash/riders/${riderId}/deposits`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Bank verification ──────────────────────────────────────────────────────

  pendingBankAccounts: (page = 0) =>
    request<Paged<PendingBankAccount>>(`/admin/bank/pending?page=${page}`),

  verifyBankAccount: (riderId: string, approve: boolean, note?: string) =>
    request<{ verified: boolean }>(`/admin/bank/riders/${riderId}/verify`, {
      method: "POST",
      body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
    }),

  orderById: (id: string) => request<OrderDetail>(`/admin/orders/${id}`),

  customerById: (id: string) =>
    request<CustomerDetail>(`/admin/customers/${id}`),

  /**
   * Whether the panel may offer each action on an order, and why not.
   *
   * The reasons come from the server rather than being re-derived here — an
   * explanation that disagrees with the rule it describes is worse than none.
   */
  orderActions: (id: string) =>
    request<OrderActions>(`/admin/orders/${id}/actions`),

  cancelOrder: (id: string, reason: string) =>
    request<{ status: string; code: string }>(`/admin/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  setCustomerStatus: (
    id: string,
    status: "active" | "blocked",
    reason?: string,
  ) =>
    request<{ status: string }>(`/admin/customers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
    }),

  // ── Knowledge and WUDA ──────────────────────────────────────────────

  /**
   * Ask WUDA.
   *
   * No special timeout handling: the server falls back to answering from
   * retrieval alone when the model is slow or unavailable, so a request that
   * takes a while still returns something usable rather than an error.
   */
  ask: (question: string) =>
    request<WudaAnswer>("/admin/knowledge/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    }),

  faq: () => request<FaqPayload>("/admin/knowledge/faq"),

  starters: () => request<{ starters: string[] }>("/admin/knowledge/starters"),

  saveNote: (note: {
    question: string;
    answer: string;
    category?: string;
    audience: KnowledgeAudience;
  }) =>
    request<{ id: string; saved: boolean }>("/admin/knowledge/notes", {
      method: "POST",
      body: JSON.stringify(note),
    }),

  knowledgeNotes: () =>
    request<{ notes: KnowledgeNote[] }>("/admin/knowledge/notes"),

  archiveNote: (id: string) =>
    request<void>(`/admin/knowledge/notes/${id}`, { method: "DELETE" }),

  knowledgeGaps: () =>
    request<{ gaps: { question: string; asked: number; lastAsked: string }[] }>(
      "/admin/knowledge/gaps",
    ),

  // ── Dashboard ─────────────────────────────────────────────────────────

  /** The landing page's figures and the fourteen days behind each of them. */
  dashboard: () => request<DashboardSnapshot>("/admin/dashboard"),

  // ── Live map ─────────────────────────────────────────────────────────────

  /**
   * One snapshot of everything the map draws.
   *
   * Polled rather than streamed: positions change every few seconds per rider
   * and nobody needs the intermediate frames, only where things are now.
   */
  liveMap: () => request<LiveMapSnapshot>("/admin/live/map"),

  // ── Monitoring ─────────────────────────────────────────────────────────────

  monitoring: () => request<Monitoring>("/admin/monitoring"),

  readiness: () => request<Readiness>("/admin/readiness"),

  // ── Access control ─────────────────────────────────────────────────────────

  adminUsers: () => request<{ results: AdminAccount[] }>("/admin/access/admins"),

  /**
   * Creates an admin and returns their password **once**.
   *
   * The server generates it; nothing here ever chooses or transmits one. The
   * caller must show it immediately, because it is stored only as a hash and
   * cannot be retrieved again — only reset.
   */
  createAdminUser: (body: { email: string; name: string; role: AdminRole }) =>
    request<{ id: string; email: string; role: AdminRole; password: string }>(
      "/admin/access/admins",
      { method: "POST", body: JSON.stringify(body) },
    ),

  updateAdminUser: (
    id: string,
    body: { role?: AdminRole; isActive?: boolean },
  ) =>
    request<{ id: string; role: AdminRole; isActive: boolean }>(
      `/admin/access/admins/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  resetAdminPassword: (id: string) =>
    request<{ email: string; password: string }>(
      `/admin/access/admins/${id}/reset-password`,
      { method: "POST" },
    ),

  changeOwnPassword: (body: {
    currentPassword: string;
    newPassword: string;
  }) =>
    request<{ changed: boolean }>("/admin/access/password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  pendingVehicles: (page = 0) =>
    request<Paged<PendingVehicle>>(`/admin/vehicles/pending?page=${page}`),

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

export interface Money {
  minor: number;
  currency: string;
}

/**
 * Fetches an export and hands back the bytes plus the name the server gave it.
 *
 * **Not a plain `<a href>`.** A link carries no `Authorization` header, so the
 * endpoint answers 401 and the browser cheerfully saves the error body as a
 * file — an operator ends up with `payouts.csv` containing `{"statusCode":401}`
 * and no indication anything went wrong. Fetching means a failure is an
 * exception the page can show.
 *
 * The filename is *parsed from the response*, never rebuilt here: the server
 * puts the period, the filter and any truncation marker into it, and a second
 * construction of that name in the panel would drift from the first.
 */
async function downloadCsv(
  path: string,
): Promise<{ blob: Blob; filename: string }> {
  const token = auth.accessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new ApiError(res.status, `Could not export (${res.status}).`);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];

  return { blob: await res.blob(), filename: named ?? "mioryde-export.csv" };
}

/**
 * Pagination metadata returned alongside a list.
 *
 * Added because every list endpoint used to return a bare `{results}`, so the
 * panel showed the first 25 rows as if they were the whole set. With 27
 * customers the last two were unreachable and nothing said so.
 */
export interface PageMeta {
  page: number;
  pageSize: number;
  /**
   * Null means **not determinable**, never zero. Either the endpoint skipped
   * counting, or the requested page is past the end. Render it as unknown; do
   * not fall back to 0, which would claim the set is empty.
   */
  total: number | null;
  hasMore: boolean;
  /** The requested page is past the end — recover by returning to page 0. */
  beyondEnd: boolean;
}

export interface Paged<T> {
  results: T[];
  page: PageMeta;
}

export interface Analytics {
  days: number;
  /** The window the server actually used, resolved in the business timezone. */
  range: { from: string; to: string };
  summary: {
    revenue: { now: Money; previous: Money };
    orders: { now: number; previous: number };
    delivered: number;
    /** A rate, not a count — 40 cancellations means nothing without a denominator. */
    cancellationRate: { now: number; previous: number };
    averageFare: Money;
    averageDistanceMeters: number;
  };
  daily: {
    date: string;
    revenue: Money;
    delivered: number;
    cancelled: number;
    placed: number;
  }[];
  breakdowns: {
    zones: { label: string; orders: number; revenue: Money }[];
    vehicles: { label: string; orders: number; revenue: Money }[];
    payments: { label: string; orders: number; revenue: Money }[];
  };
  fleet: {
    active: number;
    online: number;
    pendingKyc: number;
    suspended: number;
    docExpired: number;
    earning: number;
    utilisation: number;
    /** Uncollected float — money partners hold right now. Not in revenue. */
    cashOutstanding: Money;
    holdingCash: number;
    bankChecksPending: number;
  };
  /** All 24 buckets, always — a quiet 03:00 is a zero, not a missing bar. */
  hourly: {
    hour: number;
    placed: number;
    delivered: number;
    revenue: Money;
  }[];
  partners: {
    riderId: string;
    name: string;
    rating: number | null;
    delivered: number;
    cancelled: number;
    cancellationRate: number;
    /** What customers paid on this partner's deliveries. */
    revenue: Money;
    /** The partner's own share, from the payout frozen at delivery. */
    earned: Money;
  }[];
  retention: {
    activeCustomers: number;
    repeatCustomers: number;
    newCustomers: number;
    /** Share of active customers who have ordered more than once, ever. */
    repeatRate: number;
    averageLifetimeOrders: number;
  };
}

export interface Agreement {
  version: string;
  title: string;
  body: string;
  /** SHA-256, computed by the database from the body. Evidence of what was published. */
  contentHash: string;
  effectiveFrom: string;
}

export interface OutstandingCash {
  riderId: string;
  riderName: string;
  riderStatus: string;
  /** Company money this partner is currently holding. */
  held: { minor: number; currency: string };
  /** At or over the ceiling — they cannot go online until they deposit. */
  overLimit: boolean;
  lastDepositAt: string | null;
}

export interface PendingBankAccount {
  riderId: string;
  riderName: string;
  holderName: string | null;
  ifsc: string | null;
  /** Masked. The full account number never leaves the server. */
  accountMasked: string;
  updatedAt: string | null;
  /** How many times this partner has changed banks. High counts warrant a look. */
  changeCount: number;
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

export interface VehicleType {
  id: string;
  /** `2w`, `3w`, `tata_ace` — what an order records, and immutable for that
   *  reason. */
  code: string;
  name: string;
  capacityLabel: string;
}

/**
 * A rate card as submitted, in the units the API takes.
 *
 * Every amount is integer paise and the tax rate is basis points — 1800 is
 * 18%. Both are integers so nothing in the chain from the operator's keyboard
 * to the `numeric(12,2)` column is ever a float.
 */
export interface RateCardInput {
  zoneId: string;
  vehicleTypeId: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minFare: number;
  includedKm: number;
  gstBasisPoints: number;
}

/** The same amounts, priced against a trip that has not happened. */
export type FarePreviewInput = Omit<
  RateCardInput,
  "zoneId" | "vehicleTypeId"
> & {
  distanceKm: number;
  minutes: number;
};

export interface FarePreview {
  base: Money;
  distance: Money;
  time: Money;
  tax: Money;
  total: Money;
  /**
   * True when the components do not sum to the total because the minimum fare
   * held it up. Said out loud, because otherwise the page looks like it cannot
   * add up.
   */
  minFareApplied: boolean;
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

/**
 * Launch readiness, computed from configuration rather than remembered.
 *
 * `blocking` means the platform cannot legally or functionally operate without
 * it. Everything else degrades. Conflating the two turns a checklist into noise.
 */
export interface ReadinessCheck {
  key: string;
  label: string;
  ready: boolean;
  blocking: boolean;
  detail: string;
  category: "legal" | "payments" | "messaging" | "storage" | "operations";
}

export interface Readiness {
  checkedAt: string;
  summary: {
    ready: number;
    total: number;
    blockingOutstanding: number;
    blockingTotal: number;
  };
  checks: ReadinessCheck[];
}

export interface Monitoring {
  asOf: string;
  outbox: {
    pending: number;
    retrying: number;
    /** Gave up after max_attempts. The worker will never look at these again. */
    deadLettered: number;
    publishedLastHour: number;
    /** Age of the oldest unpublished event. Null when nothing is waiting. */
    oldestPendingSeconds: number | null;
    failures: { topic: string; count: number; lastError: string | null }[];
  };
  push: {
    customers: number;
    riders: number;
    stale: number;
    staleAfterDays: number;
    /** False means every push is written to a log and nothing leaves. */
    configured: boolean;
  };
  dispatch: {
    assignedLastDay: number;
    medianSecondsToAssign: number | null;
    p95SecondsToAssign: number | null;
    waitingTooLong: number;
    concernAfterMinutes: number;
    offers: { offered: number; rejected: number; expired: number };
  };
  ledger: {
    unbalancedTransactions: number;
    driftingAccounts: number;
    /** Double entry across the whole system, in paise. Must be exactly 0. */
    netMinor: number;
    transactions: number;
  };
}

export type AdminRole = AdminIdentity["role"];

/** The minimum length the server accepts for a password an admin chooses. */
export const MIN_PASSWORD_LENGTH = 12;

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  /** Only set while a lockout is still in force; a lapsed one reads as null. */
  lockedUntil: string | null;
  activeSessions: number;
}

/**
 * One delivery, in full — everything the schema knows about it.
 *
 * The panel had no way to open a single order before this. Support's whole job
 * is "what happened to MIO-XXXXX" and the answer was a row in a list.
 */
export interface OrderActions {
  cancel: {
    allowed: boolean;
    /** Why not, in words fit to show an operator. Null when allowed. */
    reason: string | null;
  };
}

export interface OrderDetail {
  id: string;
  code: string;
  status: string;
  placedAt: string;
  deliveredAt: string | null;
  cancellationReason: string | null;

  route: {
    pickupAddress: string;
    dropAddress: string;
    distanceMeters: number;
    /** From the quote at placement, not measured. */
    quotedSeconds: number;
    zoneName: string | null;
    vehicleName: string;
    goodsCategory: string | null;
  };

  customer: { id: string; name: string; phone: string };
  /** The recipient. A third party, so masked on the same terms. */
  receiver: { name: string; phone: string };
  rider: { id: string; name: string; phone: string } | null;

  money: {
    total: Money;
    tax: Money;
    /** The payout frozen at delivery. Null until delivered. See BUG-043. */
    riderPayout: Money | null;
    commissionPct: number | null;
    method: string;
    status: string;
  };

  timeline: {
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    /** Resolved server-side — a uuid in a timeline answers nothing. */
    actorName: string | null;
    at: string;
    metadata: Record<string, unknown>;
  }[];

  payment: {
    status: string;
    gateway: string;
    amount: Money;
    gatewayPaymentId: string | null;
    failureReason: string | null;
  } | null;

  invoice: {
    invoiceNumber: string;
    issuedAt: string;
    totalValue: Money;
  } | null;

  creditNotes: {
    creditNoteNumber: string;
    issuedAt: string;
    totalValue: Money;
    reasonCode: string;
    reason: string | null;
  }[];

  rating: { stars: number; tags: string[]; comment: string | null } | null;
}

/**
 * One customer, with the history support is asked about.
 *
 * Mirrors `OrderDetail`: the list gave a name and a count and nothing behind it.
 */
export interface CustomerDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  joinedAt: string;
  referralCode: string;
  organizationName: string | null;
  savedAddresses: number;

  orders: {
    total: number;
    delivered: number;
    cancelled: number;
    cancellationRate: number;
    /** Over the whole history, matching the analytics definition. */
    isRepeat: boolean;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    lifetimeValue: Money;
  };

  recentOrders: {
    id: string;
    code: string;
    status: string;
    total: Money;
    placedAt: string;
  }[];

  wallet: {
    /** Null when they have never had an entry — different from a zero balance. */
    balance: Money | null;
    entries: {
      kind: string;
      /** Signed: credits positive, debits negative. */
      amount: Money;
      description: string | null;
      at: string;
    }[];
  };
}

export interface LiveOrder {
  id: string;
  code: string;
  status: string;
  total: Money;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  /** When the order last *entered* this status. What the board counts from. */
  statusSince: string;
  customer: { name: string; phone: string };
  pickupAddress: string;
  dropAddress: string;
  distanceMeters: number;
  /** The routing estimate taken at quote time, for judging a long transit. */
  expectedSeconds: number;
  vehicleName: string;
  rider: { id: string; name: string; phone: string } | null;
  /** Partners who were offered this job and turned it down. */
  declines: number;
}

export interface LiveOrdersResponse {
  /** The server's clock when it answered. Elapsed times are measured from it. */
  asOf: string;
  /** True when more deliveries are live than the endpoint will return. */
  truncated: boolean;
  results: LiveOrder[];
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

/** Who a knowledge entry may be shown to. Mirrors the API's enum. */
export type KnowledgeAudience = "everyone" | "internal" | "restricted";

export interface KnowledgeEntry {
  id: string;
  /** `curated` was authored in the repository; `note` was typed by a person. */
  kind: "curated" | "note";
  question: string;
  answer: string;
  category: string;
  tags: string[];
  audience: KnowledgeAudience;
}

export interface FaqPayload {
  categories: string[];
  audiences: KnowledgeAudience[];
  entries: KnowledgeEntry[];
}

export interface KnowledgeNote {
  id: string;
  question: string;
  answer: string;
  category: string;
  audience: KnowledgeAudience;
  authorName: string | null;
  createdAt: string;
}

export interface WudaAnswer {
  answer: string;
  /**
   * `grounded` — a model composed this from the retrieved entries.
   * `retrieval` — the entries are shown as found, because the model was
   *   unavailable. The panel says which one happened rather than passing the
   *   second off as the first.
   * `unanswered` — nothing relevant was found.
   */
  mode: "grounded" | "retrieval" | "unanswered";
  sources: {
    id: string;
    question: string;
    category: string;
    source: string | null;
  }[];
  degraded?: string;
}

/** A rider's derived state.  covers both off duty and gone quiet. */
export type RiderMapStatus = "delivering" | "idle" | "offline";

export interface MapRider {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Degrees clockwise from north, when the device reported one. */
  heading: number | null;
  secondsAgo: number;
  status: RiderMapStatus;
  activeOrderId: string | null;
  activeOrderCode: string | null;
}

export interface MapOrder {
  id: string;
  code: string;
  status: string;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  pickupAddress: string;
  dropAddress: string;
  riderId: string | null;
  riderName: string | null;
  customerName: string | null;
  placedAt: string;
  statusSince: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface LiveMapSnapshot {
  /** Server clock, so ages are computed without trusting the browser's. */
  now: string;
  staleAfterSeconds: number;
  riders: MapRider[];
  orders: MapOrder[];
}

export interface DashboardTrendPoint {
  /** `YYYY-MM-DD`, server-side, so it does not shift with the browser's zone. */
  day: string;
  placed: number;
  delivered: number;
  cancelled: number;
  /** Whole paise. */
  revenueMinor: number;
}

export interface DashboardSnapshot {
  now: string;
  activeOrders: number;
  unassignedOrders: number;
  ridersOnDuty: number;
  /** A Money object, like every other amount in this client. */
  revenueToday: { minor: number; currency: string };
  /** The same slice of yesterday, not all of it — otherwise every morning
   *  would report a collapse. */
  revenueYesterday: { minor: number; currency: string };
  deliveredToday: number;
  deliveredYesterday: number;
  placedToday: number;
  trend: DashboardTrendPoint[];
}

export interface RiderTrip {
  id: string;
  code: string;
  status: string;
  total: { minor: number; currency: string };
  pickupAddress: string;
  dropAddress: string;
  placedAt: string;
  distanceMeters: number;
}
