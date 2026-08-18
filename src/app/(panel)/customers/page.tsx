"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pager,
} from "@/components/ui";
import { type AdminCustomer, type PageMeta, api } from "@/lib/api";
import { useUrlPage, useUrlParam } from "@/lib/useUrlState";
import { type Column, DataTable } from "@/components/DataTable";


/** Declared once — the grid version wrote every width twice. */
const CUSTOMER_COLUMNS: readonly Column<AdminCustomer>[] = [
  {
    key: "name",
    header: "Name",
    cell: (c) => (
      <span className="block min-w-0">
        <Link
          href={`/customers/${c.id}`}
          className="motion-change block truncate text-body underline-offset-2
                     transition-colors hover:text-accent hover:underline"
        >
          {c.name || "Unnamed"}
        </Link>
        {c.email && (
          <span className="block truncate text-meta text-fg-faint">{c.email}</span>
        )}
      </span>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    width: "160px",
    cell: (c) => (
      <span className="font-mono text-meta text-fg-mid">{c.phone}</span>
    ),
  },
  {
    key: "orders",
    header: "Orders",
    width: "96px",
    align: "right",
    cell: (c) => (
      <span className="font-mono text-meta tabular-nums">{c.orderCount}</span>
    ),
  },
  {
    key: "joined",
    header: "Joined",
    width: "116px",
    align: "right",
    cell: (c) => (
      <span className="font-mono text-meta text-fg-faint">
        {new Date(c.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "2-digit",
        })}
      </span>
    ),
  },
];

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
        ) : (
          <DataTable
            caption="Customers, newest first"
            columns={CUSTOMER_COLUMNS}
            rows={customers}
            rowKey={(c) => c.id}
            emptyTitle="No customers match"
            emptyHint={search ? "Try a different search." : "Signups appear here."}
          />
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
