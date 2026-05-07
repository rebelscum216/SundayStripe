import { TopbarSearch } from "./topbar-search";

type PageHeaderProps = {
  section?: string;
  title: string;
  meta?: string;
  children?: React.ReactNode;
};

export function PageHeader({ section, title, meta, children }: PageHeaderProps) {
  return (
    <div className="ss-topbar-blur sticky top-0 z-10 flex items-center gap-3 border-b px-6 py-3"
      style={{ borderColor: "var(--ss-line)" }}>
      <div style={{ fontFamily: "var(--ss-font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ss-ink)" }}>
        {title}
      </div>
      {(section || meta) && (
        <div style={{ fontSize: 13, color: "var(--ss-ink-3)" }}>
          <span style={{ margin: "0 6px", color: "var(--ss-ink-4)" }}>/</span>
          {meta ?? section}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <TopbarSearch />
      {children}
    </div>
  );
}
