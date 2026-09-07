import { SystemBreadcrumb } from "./SystemNavigation";

export default function OcrBreadcrumb({
  items,
}: {
  items: Array<string | undefined | null | false>;
}) {
  const visibleItems = ["OCR", ...items.filter(Boolean)] as string[];

  return <SystemBreadcrumb items={visibleItems} />;
}
