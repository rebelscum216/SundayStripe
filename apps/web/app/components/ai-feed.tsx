"use client";

import { useState } from "react";
import Link from "next/link";
import type { AiAction } from "../page";

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.35, transition: "opacity 0.1s" }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  "seo-rewrite": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z M19 14l.9 2.2L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.8z" />
    </svg>
  ),
  "price-fix": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  "listing-fix": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  "amazon-rewrite": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c4 3 14 3 18 0" /><path d="M5 19c.5-.5 1-1 2-1" />
    </svg>
  ),
  "expand": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14m-7-7h14" />
    </svg>
  ),
  "sync-fix": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  "reorder": (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
    </svg>
  ),
};

const TARGET_COLORS: Record<string, { bg: string; color: string }> = {
  Shopify:    { bg: "var(--ss-sage-soft)",   color: "var(--ss-sage-ink)" },
  Amazon:     { bg: "var(--ss-amber-soft)",  color: "var(--ss-amber-ink)" },
  Merchant:   { bg: "var(--ss-orange-soft)", color: "var(--ss-orange-ink)" },
  Operations: { bg: "var(--ss-red-soft)",    color: "var(--ss-red-ink)" },
};

function ArrowIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-6-7l7 7-7 7" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5z M19 14l.9 2.2L22 17l-2.1.8L19 20l-.9-2.2L16 17l2.1-.8z M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z" />
    </svg>
  );
}

export function AiFeed({ actions }: { actions: AiAction[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = actions.filter(a => !dismissed.has(a.id));

  return (
    <div className="ss-card" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: "1px solid var(--ss-line)",
      }}>
        <SparklesIcon />
        <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 13, fontWeight: 600, color: "var(--ss-ink)" }}>
          AI suggested actions
        </div>
        {visible.length > 0 && (
          <span className="ss-pill ss-pill-orange">{visible.length} new</span>
        )}
        <div style={{ flex: 1 }} />
        <Link href="/ai" className="ss-btn ss-btn-sm" style={{ textDecoration: "none" }}>
          AI tools
        </Link>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--ss-ink-3)" }}>
          No suggested actions right now. Systems are looking healthy.
        </div>
      ) : (
        visible.map((action, i) => {
          const tileColors = TARGET_COLORS[action.target] ?? TARGET_COLORS.Shopify;
          const icon = TYPE_ICONS[action.type] ?? TYPE_ICONS["seo-rewrite"];
          const isLast = i === visible.length - 1;

          return (
            <div key={action.id} className="ss-ai-feed-row" style={{
              padding: "14px 16px",
              borderBottom: isLast ? "none" : "1px solid var(--ss-line)",
              alignItems: "center",
            }}>
              {/* Icon tile + content — clickable link to detail */}
              <Link href={action.href} style={{
                display: "flex", alignItems: "center", gap: 12,
                minWidth: 0, flex: 1, textDecoration: "none",
                cursor: "pointer",
              }}
                className="ss-ai-feed-link"
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: tileColors.bg,
                  display: "grid", placeItems: "center",
                  color: tileColors.color,
                  flexShrink: 0,
                }}>
                  {icon}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ss-ink)", marginBottom: 2 }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ss-ink-3)" }}>
                    {action.reason}
                  </div>
                  {action.preview && (
                    <div style={{
                      marginTop: 6, fontSize: 11,
                      fontFamily: "var(--ss-font-mono)",
                      display: "flex", gap: 8, alignItems: "center",
                    }}>
                      <span style={{ color: "var(--ss-red-ink)", textDecoration: "line-through" }}>
                        {action.preview.from}
                      </span>
                      <ArrowIcon />
                      <span style={{ color: "var(--ss-sage-ink)" }}>
                        {action.preview.to}
                      </span>
                    </div>
                  )}
                </div>

                <ChevronIcon />
              </Link>

              {/* Impact */}
              <div>
                <div style={{ fontSize: 11, color: "var(--ss-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, marginBottom: 2 }}>
                  Impact
                </div>
                <div className="ss-num" style={{ fontSize: 13, fontWeight: 600, color: "var(--ss-orange-ink)" }}>
                  {action.impact}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  className="ss-btn ss-btn-sm"
                  onClick={() => setDismissed(prev => new Set([...prev, action.id]))}
                >
                  Hide for now
                </button>
                <Link href={action.href} className="ss-btn ss-btn-primary ss-btn-sm" style={{ textDecoration: "none" }}>
                  {action.cta}
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
