"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pager,
  SkeletonRows,
} from "@/components/ui";
import { type AdminCustomer, type PageMeta, api } from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage, pageReady] = useUrlPage();
  const [search, setSearch, searchReady] = useUrlParam("search");
  const urlReady = pageReady && searchReady;

  // Narrowing returns to the first page. Two sequential URL writes, which
  // compose because each setter re-reads the live query string.
  const changeSearch = (next: string) => {
    setPage(0);
    setSearch(next);
  };
  const [error, setError] = useState<string | null>(null);

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const requestId = useRef(0);

  useEffect(() => {
    if (!urlReady) return;

    const id = ++requestId.current;
    setCustomers(null);
    setError(null);
    api
      .customers({
        ...(page ? { page } : {}),
        ...(debounced ? { search: debounced } : {}),
      })
      .then((res) => {
        if (id !== requestId.current) return;
        if (res.page.beyondEnd) {
          setPage(0);
          return;
        }
        setCustomers(res.results);
        setMeta(res.page);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(
          e instanceof Error ? e.message : "Could not load customers.",
        );
      });
  }, [debounced, page, urlReady, setPage]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageHeader
            title="Customers"
            subtitle={
              customers === null
                ? "Loading…"
                : `${meta?.total ?? customers.length} customers`
            }
          />
        </div>
        <div className="w-full max-w-[280px]">
          <Input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Name or phone"
            aria-label="Search customers"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {error ? (
          // Finance accounts are refused this list on purpose, so a 403 is a
          // policy outcome rather than a fault.
          <EmptyState
            title={
              error.includes("requires")
                ? "Your role cannot view customers"
                : "Could not load customers"
            }
            hint={error}
          />
        ) : customers === null ? (
          <SkeletonRows rows={8} />
        ) : customers.length === 0 ? (
          <EmptyState
            title="No customers match"
            hint={search ? "Try a different search." : "Signups appear here."}
          />
        ) : (
          <>
            <div
              className="grid grid-cols-[1fr_150px_90px_110px] gap-4 border-b border-line
                         bg-panel px-4 py-2 font-mono text-[9px] uppercase tracking-[2px]
                         text-fg-muted"
            >
              <span>Name</span>
              <span>Phone</span>
              <span className="text-right">Orders</span>
              <span className="text-right">Joined</span>
            </div>
            <ul className="stagger divide-y divide-line">
              {customers.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[1fr_150px_90px_110px] items-center gap-4 px-4
                             py-3 transition-colors duration-150 hover:bg-panel"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/customers/${c.id}`}
                      className="motion-change block truncate text-body underline-offset-2
                                 transition-colors hover:text-accent hover:underline"
                    >
                      {c.name || "Unnamed"}
                    </Link>
                    {c.email && (
                      <span className="block truncate text-[11px] text-fg-faint">
                        {c.email}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[12px] text-fg-mid">
                    {c.phone}
                  </span>
                  <span className="text-right font-mono text-xs tabular-nums">
                    {c.orderCount}
                  </span>
                  <span className="text-right font-mono text-[11px] text-fg-faint">
                    {new Date(c.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {meta && (
        <Pager
          page={meta}
          busy={customers === null}
          noun="customers"
          onChange={setPage}
        />
      )}
    </div>
  );
}
