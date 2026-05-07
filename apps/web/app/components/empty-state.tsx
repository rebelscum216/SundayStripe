type EmptyStateProps = {
  message: string;
  detail?: string;
  action?: {
    label: string;
    href: string;
  };
};

export function EmptyState({ message, detail, action }: EmptyStateProps) {
  return (
    <div className="ss-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ss-ink)" }}>{message}</p>
      {detail && <p style={{ marginTop: 4, fontSize: 14, color: "var(--ss-ink-3)" }}>{detail}</p>}
      {action && (
        <a
          href={action.href}
          className="ss-btn ss-btn-primary"
          style={{ marginTop: 20, display: "inline-flex" }}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
