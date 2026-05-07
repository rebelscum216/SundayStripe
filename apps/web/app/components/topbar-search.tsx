"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProductResult = {
  id: string;
  title: string | null;
  canonicalSku: string;
  missingAttributes?: string[];
};

type AlertResult = {
  id: string;
  severity: string;
  category: string;
  sourcePlatform: string | null;
  entityRef: string | null;
  payloadJson: {
    title?: string;
    merchant_product_name?: string;
    offer_id?: string;
    topic?: string;
    error?: string;
  } | null;
};

type SearchConsoleQuery = {
  query?: string;
  clicks: number;
  impressions: number;
  position: number;
};

type SearchConsolePage = {
  url?: string;
  clicks: number;
  impressions: number;
  position: number;
};

type SearchItem = {
  id: string;
  kind: "nav" | "product" | "alert" | "query" | "page";
  label: string;
  detail: string;
  href: string;
  terms: string;
};

const navItems: SearchItem[] = [
  { id: "nav-home", kind: "nav", label: "Command Center", detail: "Live operating cockpit", href: "/", terms: "home command center overview cockpit" },
  { id: "nav-products", kind: "nav", label: "Products", detail: "Catalog and channel coverage", href: "/products", terms: "products catalog sku inventory variants" },
  { id: "nav-alerts", kind: "nav", label: "Alerts", detail: "Open channel issues", href: "/alerts", terms: "alerts issues warnings triage" },
  { id: "nav-search-console", kind: "nav", label: "SEO Opportunities", detail: "Search Console queries and pages", href: "/search-console", terms: "seo opportunities search console gsc queries pages" },
  { id: "nav-shopify", kind: "nav", label: "Shopify", detail: "Shopify channel workspace", href: "/shopify", terms: "shopify store products" },
  { id: "nav-merchant", kind: "nav", label: "Merchant Center", detail: "Google Merchant listings", href: "/merchant", terms: "merchant center google listings feed" },
  { id: "nav-amazon", kind: "nav", label: "Amazon", detail: "Amazon SP-API listings", href: "/amazon", terms: "amazon asin sp api listings" },
  { id: "nav-cross-channel", kind: "nav", label: "Cross-Channel", detail: "Revenue, SEO, and coverage opportunities", href: "/cross-channel", terms: "cross channel revenue seo coverage opportunities" },
  { id: "nav-inventory", kind: "nav", label: "Inventory", detail: "90-day stock radar", href: "/inventory", terms: "inventory stock reorder variants" },
  { id: "nav-ai", kind: "nav", label: "AI Copilot", detail: "Assisted commerce operations", href: "/ai", terms: "ai copilot assistant" },
  { id: "nav-operations", kind: "nav", label: "Operations", detail: "Integration health and jobs", href: "/operations", terms: "operations jobs sync health failed" },
  { id: "nav-settings", kind: "nav", label: "Connections", detail: "Integration readiness", href: "/settings", terms: "settings connections integrations" },
];

const kindLabels: Record<SearchItem["kind"], string> = {
  nav: "Go to",
  product: "Product",
  alert: "Alert",
  query: "Query",
  page: "Page",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function getAlertTitle(alert: AlertResult) {
  return (
    alert.payloadJson?.title ??
    alert.payloadJson?.merchant_product_name ??
    alert.payloadJson?.offer_id ??
    alert.payloadJson?.topic ??
    alert.entityRef ??
    "Alert"
  );
}

function getPageLabel(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? ((await response.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

function matches(item: SearchItem, query: string) {
  if (!query) return true;
  return item.terms.includes(query);
}

export function TopbarSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remoteItems, setRemoteItems] = useState<SearchItem[]>([]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCommandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isCommandSearch) return;

      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || loaded || loading) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      getJson<ProductResult[]>("/api-proxy/products", []),
      getJson<AlertResult[]>("/api-proxy/alerts", []),
      getJson<SearchConsoleQuery[]>("/api-proxy/search-console/queries", []),
      getJson<SearchConsolePage[]>("/api-proxy/search-console/pages", []),
    ]).then(([products, alerts, queries, pages]) => {
      if (cancelled) return;

      const items: SearchItem[] = [
        ...products.slice(0, 80).map((product) => {
          const label = product.title?.trim() || product.canonicalSku;
          const missing = product.missingAttributes?.length
            ? ` · ${product.missingAttributes.length} missing attr${product.missingAttributes.length === 1 ? "" : "s"}`
            : "";
          return {
            id: `product-${product.id}`,
            kind: "product" as const,
            label,
            detail: `${product.canonicalSku}${missing}`,
            href: `/products/${product.id}`,
            terms: `${label} ${product.canonicalSku} product sku catalog`.toLowerCase(),
          };
        }),
        ...alerts.slice(0, 80).map((alert) => {
          const label = getAlertTitle(alert);
          return {
            id: `alert-${alert.id}`,
            kind: "alert" as const,
            label,
            detail: `${alert.severity} · ${alert.category}${alert.sourcePlatform ? ` · ${alert.sourcePlatform}` : ""}`,
            href: "/alerts",
            terms: `${label} ${alert.severity} ${alert.category} ${alert.sourcePlatform ?? ""} ${alert.payloadJson?.error ?? ""}`.toLowerCase(),
          };
        }),
        ...queries.slice(0, 60).filter((row) => row.query).map((row, index) => ({
          id: `query-${index}-${row.query}`,
          kind: "query" as const,
          label: row.query!,
          detail: `${formatNumber(row.impressions)} impressions · avg position ${row.position.toFixed(1)}`,
          href: `/search-console?query=${encodeURIComponent(row.query!)}`,
          terms: `${row.query} search console query seo gsc`.toLowerCase(),
        })),
        ...pages.slice(0, 40).filter((row) => row.url).map((row, index) => {
          const label = getPageLabel(row.url!);
          return {
            id: `page-${index}-${row.url}`,
            kind: "page" as const,
            label,
            detail: `${formatNumber(row.impressions)} impressions · avg position ${row.position.toFixed(1)}`,
            href: "/search-console",
            terms: `${label} ${row.url} search console page seo gsc`.toLowerCase(),
          };
        }),
      ];

      setRemoteItems(items);
      setLoaded(true);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLoaded(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loaded, loading, open]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const allItems = [...navItems, ...remoteItems];
    return allItems
      .filter((item) => matches(item, normalizedQuery))
      .slice(0, normalizedQuery ? 12 : 8);
  }, [query, remoteItems]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.blur();
  }

  function selectItem(item: SearchItem) {
    router.push(item.href);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) {
        selectItem(selected);
      } else if (query.trim()) {
        router.push(`/products?query=${encodeURIComponent(query.trim())}`);
        close();
      }
    }
  }

  return (
    <div className="ss-topbar-search-wrap">
      <label className="ss-topbar-search" aria-label="Search">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search products, queries, alerts…"
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd>⌘K</kbd>
      </label>

      {open && (
        <>
          <button className="ss-search-scrim" type="button" aria-label="Close search" onClick={close} />
          <div className="ss-search-popover" role="listbox" aria-label="Search results">
            {loading && remoteItems.length === 0 ? (
              <div className="ss-search-empty">Loading products, queries, and alerts...</div>
            ) : results.length > 0 ? (
              results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ss-search-result${index === activeIndex ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <span className="ss-search-result-kind">{kindLabels[item.kind]}</span>
                  <span className="ss-search-result-copy">
                    <span className="ss-search-result-title">{item.label}</span>
                    <span className="ss-search-result-detail">{item.detail}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="ss-search-empty">
                No matches. Press Enter to search products for “{query.trim()}”.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
