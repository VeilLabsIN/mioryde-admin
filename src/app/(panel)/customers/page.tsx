"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { CustomerDrawer } from "@/components/CustomerDrawer";


/** Declared once — the grid version wrote every width twice. */
function customerColumns(
  onOpen: (customer: AdminCustomer) => void,
): readonly Column<AdminCustomer>[] {
  return [
  {
    key: "name",
    header: "Name",
    cell: (c) => (
      <span className="block min-w-0">
        {/*
          The keyboard route into the drawer. `DataTable` opens a row on click
          for a mouse, but a `<tr>` has no role to announce and cannot be the
          announced path — so a real focusable control inside the row is, and
          the name was already the designated target.

          Whole-row activation is right on this table: unlike partners, a
          customer row carries no destructive action for a stray click to land
          near.
        */}
        <button
          type="button"
          onClick={() => onOpen(c)}
          className="motion-change block max-w-full truncate text-left text-body
                     underline-offset-2 transition-colors hover:text-accent hover:underline"
        >
          {c.name || "Unnamed"}
        </button>
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
}

export default function CustomersPage() {
  // The open customer's id is the drawer's state. Not in the URL: the filter
  // and page are a view worth sharing, but which record somebody had open is a
  // moment in one person's triage.
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);

  // Stable across renders — the setter is, so the definitions are not rebuilt
  // on every keystroke in the search box.
  const columns = useMemo(
    () => customerColumns((customer) => setOpenCustomerId(customer.id)),
    [],
  );
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
            onRowActivate={(customer) => setOpenCustomerId(customer.id)}
            caption="Customers, newest first"
            columns={columns}
            rows={customers}
            rowKey={(c) => c.id}
            emptyTitle="No customers match"
            emptyHint={search ? "Try a different search." : "Signups appear here."}
          />
        )}
      </Card>

      <CustomerDrawer
        customerId={openCustomerId}
        onClose={() => setOpenCustomerId(null)}
      />

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
