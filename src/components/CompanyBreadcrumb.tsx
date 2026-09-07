export default function CompanyBreadcrumb({
  companyName,
  items = [],
  singleLine = false,
}: {
  companyName: string;
  items?: string[];
  singleLine?: boolean;
}) {
  const path = ["Companies", companyName, ...items].filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3] ${singleLine ? "min-h-[18px] flex-nowrap overflow-hidden whitespace-nowrap" : "flex-wrap"}`}
    >
      {path.map((item, index) => (
        <span key={`${item}-${index}`} className="contents">
          {index > 0 && <span className="text-[#A1B6C6]">/</span>}
          <span
            className={
              index === path.length - 1 ? "text-[#A1B6C6]" : undefined
            }
          >
            {item}
          </span>
        </span>
      ))}
    </nav>
  );
}
