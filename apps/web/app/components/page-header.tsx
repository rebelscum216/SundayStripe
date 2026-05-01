type PageHeaderProps = {
  section: string;
  title: string;
  meta?: string;
};

export function PageHeader({ section, title, meta }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-zinc-800 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {section}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-zinc-100 md:text-4xl">
          {title}
        </h1>
      </div>
      {meta && <span className="font-mono text-sm text-zinc-400">{meta}</span>}
    </header>
  );
}
