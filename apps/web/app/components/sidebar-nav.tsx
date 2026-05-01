"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavLink = { href: string; label: string; icon: React.ReactNode };
type NavSep = { type: "sep" };
type NavItem = NavLink | NavSep;

function CommandIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="0.5" />
      <rect x="9" y="2" width="5" height="5" rx="0.5" />
      <rect x="2" y="9" width="5" height="5" rx="0.5" />
      <rect x="9" y="9" width="5" height="5" rx="0.5" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5l6-3 6 3v6l-6 3-6-3z" />
      <path d="M8 2v12M2 5l6 3 6-3" />
    </svg>
  );
}

function AlertsIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2a5 5 0 00-5 5v2l-1 2h12l-1-2V7a5 5 0 00-5-5z" />
      <path d="M6.5 12.5a1.5 1.5 0 003 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L13.5 13.5" />
    </svg>
  );
}

function CrossChannelIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="13" cy="12" r="1.5" />
      <path d="M4.5 8L11.5 4.5M4.5 8L11.5 11.5" />
    </svg>
  );
}

function InventoryIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="9" width="12" height="5" rx="0.5" />
      <rect x="3" y="5" width="10" height="4" />
      <rect x="4" y="2" width="8" height="3" />
    </svg>
  );
}

function OperationsIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
    </svg>
  );
}

function ConnectionsIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 6.5L13 3" />
      <path d="M10 3h3v3" />
      <path d="M6.5 9.5L3 13" />
      <path d="M6 13H3v-3" />
      <path d="M8 8m-2 0a2 2 0 104 0 2 2 0 00-4 0" />
    </svg>
  );
}

function ShopifyIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h10l-1.5 9H4.5z" />
      <circle cx="5.5" cy="13.5" r="1" />
      <circle cx="10.5" cy="13.5" r="1" />
      <path d="M10 3c0-1.5-1-2-2-2s-2 0.5-2 2" />
    </svg>
  );
}

function MerchantIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5h14l-1 9H2z" />
      <path d="M5 5V3a3 3 0 016 0v2" />
      <path d="M5 9h6" />
    </svg>
  );
}

function AmazonIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="12" height="8" rx="1" />
      <path d="M5 8h6M8 5v6" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" />
      <path d="M13 11l.6 1.8L15.4 13l-1.8.6L13 15.4l-.6-1.8L10.6 13l1.8-.6z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M15 5L5 15M5 5l10 10" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { href: "/", label: "Command", icon: <CommandIcon /> },
  { type: "sep" },
  { href: "/products", label: "Products", icon: <ProductsIcon /> },
  { href: "/alerts", label: "Alerts", icon: <AlertsIcon /> },
  { href: "/inventory", label: "Inventory", icon: <InventoryIcon /> },
  { type: "sep" },
  { href: "/search-console", label: "Search Console", icon: <SearchIcon /> },
  { href: "/cross-channel", label: "Cross-Channel", icon: <CrossChannelIcon /> },
  { type: "sep" },
  { href: "/shopify", label: "Shopify", icon: <ShopifyIcon /> },
  { href: "/merchant", label: "Merchant", icon: <MerchantIcon /> },
  { href: "/amazon", label: "Amazon", icon: <AmazonIcon /> },
  { href: "/ai", label: "AI Copilot", icon: <AiIcon /> },
  { type: "sep" },
  { href: "/operations", label: "Operations", icon: <OperationsIcon /> },
  { href: "/settings", label: "Connections", icon: <ConnectionsIcon /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-2">
      {navItems.map((item, i) => {
        if ("type" in item) {
          return <div key={i} className="my-2 border-t border-zinc-800/60" />;
        }
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-zinc-800 px-4 py-4">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 text-xs font-bold text-white">
          S
        </div>
        <div className="leading-none">
          <div className="text-sm font-semibold text-zinc-100">Sunday Stripe</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Commerce Hub
          </div>
        </div>
      </div>
      <NavLinks
        pathname={pathname}
        onNavigate={() => setMobileOpen(false)}
      />
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <header className="fixed left-0 right-0 top-0 z-20 flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500 text-[10px] font-bold text-white">
            S
          </div>
          <span className="text-sm font-semibold text-zinc-100">Sunday Stripe</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <MenuIcon />
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 text-xs font-bold text-white">
                  S
                </div>
                <span className="text-sm font-semibold text-zinc-100">Sunday Stripe</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <CloseIcon />
              </button>
            </div>
            <NavLinks
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
