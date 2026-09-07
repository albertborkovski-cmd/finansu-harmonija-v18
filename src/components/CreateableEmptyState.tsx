import { FileText } from "lucide-react";
import { PageActionButton } from "./PageHeader";

export default function CreateableEmptyState({
  onCreate,
  title = "Empty collection",
  description = 'Press "Create new" button to start your work',
}: {
  onCreate: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="sticky left-0 flex min-h-[260px] w-[min(100%,calc(100vw-48px))] flex-col items-center justify-center gap-4 text-center text-[#7288A3]">
      <FileText size={32} strokeWidth={1.6} className="text-[#A1B6C6]" />
      <div className="flex flex-col items-center gap-2">
        <span className="font-montserrat text-[18px] font-semibold leading-6 text-[#10233A]">
          {title}
        </span>
        <span className="font-montserrat text-[14px] font-medium leading-5 text-[#7288A3]">
          {description}
        </span>
      </div>
      <PageActionButton onClick={onCreate}>Create new</PageActionButton>
    </div>
  );
}
