export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-line px-6 pb-4 pt-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-ink-2">{sub}</p>}
      </div>
      {actions}
    </header>
  );
}
