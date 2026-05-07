export function TopbarSearch() {
  return (
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
      <input type="search" placeholder="Search products, queries, alerts…" />
      <kbd>⌘K</kbd>
    </label>
  );
}
