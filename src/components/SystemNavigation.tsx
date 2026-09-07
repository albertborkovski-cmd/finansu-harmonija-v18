import { ArrowLeft } from "lucide-react";

export function HeaderBackButton({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-[#7288A3] transition-colors hover:bg-[#F0F7FA] hover:text-[#007EA7]"
    >
      <ArrowLeft size={20} strokeWidth={2} />
    </button>
  );
}

export function SystemBreadcrumb({
  items,
}: {
  items: Array<string | undefined | null | false>;
}) {
  const visibleItems = items.filter(Boolean) as string[];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-h-[18px] flex-wrap items-center gap-2 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]"
    >
      {visibleItems.map((item, index) => (
        <span key={`${item}-${index}`} className="contents">
          {index > 0 && <span className="text-[#A1B6C6]">/</span>}
          <span className={index === visibleItems.length - 1 ? "text-[#A1B6C6]" : ""}>
            {item}
          </span>
        </span>
      ))}
    </nav>
  );
}
