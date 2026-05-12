"use client";

import { useDrawer } from "./drawer-context";

export function AiDrawer() {
  const { isOpen, content, close } = useDrawer();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={close}
        />
      )}
      <aside
        aria-label="AI analysis panel"
        className={`fixed right-0 top-0 z-40 flex h-full w-full flex-col transition-transform duration-300 ease-in-out lg:w-[420px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ borderLeft: "1px solid var(--ss-line)", background: "var(--ss-bg)" }}
      >
        <div className="flex flex-shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--ss-line)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ss-ink-3)" }}>
            AI Analysis
          </span>
          <button
            onClick={close}
            aria-label="Close panel"
            className="ss-btn ss-btn-icon"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {content}
        </div>
      </aside>
    </>
  );
}
