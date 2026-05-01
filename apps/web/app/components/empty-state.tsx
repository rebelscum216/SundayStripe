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
    <div className="border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-100">{message}</p>
      {detail && <p className="mt-1 text-sm text-zinc-400">{detail}</p>}
      {action && (
        <a
          href={action.href}
          className="mt-5 inline-flex items-center justify-center border border-blue-500 bg-blue-950 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-900"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
