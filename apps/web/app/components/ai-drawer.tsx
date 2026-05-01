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
        className={`fixed right-0 top-0 z-40 flex h-full w-full flex-col border-l border-zinc-800 bg-zinc-900 transition-transform duration-300 ease-in-out lg:w-[380px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            AI Analysis
          </span>
          <button
            onClick={close}
            aria-label="Close panel"
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
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
        <div className="flex-1 overflow-y-auto p-4 text-sm text-zinc-300">
          {content}
        </div>
      </aside>
    </>
  );
}
