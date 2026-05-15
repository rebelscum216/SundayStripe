"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/* ── Icons (14×14, 1.6px stroke) ── */
function Ic({ d, size = 14 }: { d: string | React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0">
      {typeof d === "string" ? <path d={d} /> : d}
    </svg>
  );
}

const icons = {
  home:       <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  spark:      "M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z M19 14l.9 2.2L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.8z",
  search:     <><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></>,
  box:        <><path d="M21 8v13H3V8M1 3h22v5H1z"/><path d="M10 12h4"/></>,
  bell:       "M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9zm5 13a2 2 0 002 0",
  shop:       "M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 14h6",
  google:     "M21 12a9 9 0 11-2.6-6.4l-2.5 2.5a5.5 5.5 0 102 5.4H12V10h9z",
  target:     <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  amazon:     <><path d="M3 17c4 3 14 3 18 0"/><path d="M5 19c.5-.5 1-1 2-1"/></>,
  link:       "M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1m-2 12a5 5 0 01-7 0 5 5 0 010-7l3-3a5 5 0 017 0",
  flag:       "M5 21V4h12l-2 4 2 4H5",
  sparkles:   "M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z M19 14l.9 2.2L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.8z M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z",
  settings:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
  inventory:  <><rect x="2" y="9" width="12" height="5" rx="0.5"/><rect x="3" y="5" width="10" height="4"/><rect x="4" y="2" width="8" height="3"/></>,
  operations: <><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
  menu:       "M3 6h18M3 12h18M3 18h18",
  x:          "M6 6l12 12M6 18L18 6",
};

type NavGroup = { group: string };
type NavLink = {
  href: string;
  label: string;
  icon: keyof typeof icons;
  badge?: string;
  badgeWarn?: boolean;
};
type NavItem = NavGroup | NavLink;

const navItems: NavItem[] = [
  { group: "Workspace" },
  { href: "/",               label: "Command Center",    icon: "home" },
  { href: "/products",       label: "Products",          icon: "box" },
  { href: "/alerts",         label: "Alerts",            icon: "bell",   badge: "20", badgeWarn: true },
  { group: "Channels" },
  { href: "/shopify",        label: "Shopify",           icon: "shop" },
  { href: "/search-console", label: "Search Console",    icon: "search", badge: "32" },
  { href: "/merchant",       label: "Merchant Center",   icon: "target" },
  { href: "/amazon",         label: "Amazon",            icon: "amazon" },
  { group: "Insights" },
  { href: "/cross-channel",  label: "Cross-Channel",     icon: "link" },
  { href: "/inventory",      label: "Inventory",         icon: "inventory" },
  { href: "/ai",             label: "AI Copilot",        icon: "sparkles" },
  { group: "System" },
  { href: "/operations",     label: "Operations",        icon: "operations" },
  { href: "/settings",       label: "Connections",       icon: "settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto py-2">
      {navItems.map((item, i) => {
        if ("group" in item) {
          return (
            <div key={i} style={{
              padding: i === 0 ? "10px 16px 4px" : "20px 16px 4px",
              marginTop: i === 0 ? 0 : 4,
              borderTop: i === 0 ? "none" : "1px solid var(--ss-side-line)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ss-side-ink-3)",
              fontWeight: 500,
            }}>
              {item.group}
            </div>
          );
        }
        const active = isActive(pathname, item.href);
        return (
          <div key={item.href} style={{ padding: "0 8px" }}>
            <Link
              href={item.href}
              onClick={onNavigate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                color: active ? "var(--ss-side-ink)" : "var(--ss-side-ink-2)",
                backgroundColor: active ? "var(--ss-side-active)" : "transparent",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                transition: "background 0.1s, color 0.1s",
                position: "relative",
              }}
              className="ss-nav-link"
            >
              {/* Orange left indicator */}
              {active && (
                <span style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 2,
                  height: 14,
                  background: "var(--ss-orange)",
                  borderRadius: 2,
                }} />
              )}
              <Ic d={icons[item.icon]} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  background: item.badgeWarn ? "var(--ss-orange)" : "var(--ss-side-line)",
                  color: item.badgeWarn ? "#fff" : "var(--ss-side-ink)",
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 8,
                  fontFamily: "var(--ss-font-mono)",
                }}>
                  {item.badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "18px 16px 16px",
        borderBottom: "1px solid var(--ss-side-line)",
        flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6,
          background: "var(--ss-orange)",
          display: "grid", placeItems: "center",
          color: "#fff", fontWeight: 700, fontSize: 13,
          fontFamily: "var(--ss-font-display)",
          letterSpacing: "-0.02em",
          flexShrink: 0,
        }}>S</div>
        <div>
          <div style={{
            fontFamily: "var(--ss-font-display)",
            fontWeight: 600, fontSize: 14,
            letterSpacing: "-0.01em",
            color: "var(--ss-side-ink)",
          }}>Sunday Stripe</div>
          <div style={{
            fontSize: 11,
            color: "var(--ss-side-ink-3)",
            fontFamily: "var(--ss-font-mono)",
          }}>sundaystripe.com</div>
        </div>
      </div>

      <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />

      {/* Footer avatar */}
      <div style={{
        padding: 12,
        borderTop: "1px solid var(--ss-side-line)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--ss-orange), #c79233)",
          display: "grid", placeItems: "center",
          color: "#fff", fontWeight: 600, fontSize: 11,
          flexShrink: 0,
        }}>A</div>
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 12, color: "var(--ss-side-ink)" }}>Andrew</div>
          <div style={{ fontSize: 11, color: "var(--ss-side-ink-3)" }}>Owner · 1 store</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="ss-side hidden lg:flex flex-col"
        style={{
          width: 220,
          minWidth: 220,
          borderRight: "1px solid #000",
          height: "100%",
          flexShrink: 0,
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile: fixed top bar */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between px-4"
        style={{ background: "var(--ss-side-bg)", borderBottom: "1px solid var(--ss-side-line)" }}>
        <div className="flex items-center gap-2">
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: "var(--ss-orange)",
            display: "grid", placeItems: "center",
            color: "#fff", fontWeight: 700, fontSize: 11,
            fontFamily: "var(--ss-font-display)",
          }}>S</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-side-ink)", fontFamily: "var(--ss-font-display)" }}>
            Sunday Stripe
          </span>
        </div>
        <button onClick={() => setMobileOpen(true)}
          style={{ color: "var(--ss-side-ink-2)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Ic d={icons.menu} size={18} />
        </button>
      </header>

      {/* Mobile offset */}
      <div className="lg:hidden h-12 w-0 flex-shrink-0" />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setMobileOpen(false)}>
          <aside className="ss-side flex flex-col h-full" style={{ width: 260, borderRight: "1px solid #000" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: "1px solid var(--ss-side-line)",
              flexShrink: 0,
            }}>
              <div className="flex items-center gap-2">
                <div style={{
                  width: 22, height: 22, borderRadius: 5, background: "var(--ss-orange)",
                  display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 11,
                }}>S</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ss-side-ink)" }}>Sunday Stripe</span>
              </div>
              <button onClick={() => setMobileOpen(false)}
                style={{ color: "var(--ss-side-ink-2)", background: "none", border: "none", cursor: "pointer" }}>
                <Ic d={icons.x} size={16} />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
