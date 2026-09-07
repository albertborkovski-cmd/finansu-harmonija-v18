import { ArrowLeft } from "lucide-react";

export default function BackNavigationButton({
  onClick,
  label = "Back to list",
  iconOnly = false,
}: {
  onClick: () => void;
  label?: string;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex flex-shrink-0 items-center text-[#007EA7] transition-colors hover:text-[#006B8F] hover:underline ${
        iconOnly
          ? "h-5 w-5 justify-center"
          : "gap-1 font-montserrat text-[12px] font-semibold leading-[18px]"
      }`}
    >
      <ArrowLeft size={16} strokeWidth={2} />
      {!iconOnly && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}
