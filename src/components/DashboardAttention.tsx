import { AlertCircle, Bell } from "lucide-react";
import type { AttentionNotification, NotificationTab } from "../lib/notifications";

export default function DashboardAttention({ rows, onOpen }: {
  rows: AttentionNotification[];
  onOpen: (tab?: NotificationTab, query?: string) => void;
}) {
  return (
    <section aria-labelledby="dashboard-attention-heading" className="col-span-full w-full min-w-0 overflow-hidden rounded-2xl border border-[#D3E1EC] bg-white">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-[#E1EBF2] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="dashboard-attention-heading" className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Needs your attention</h2>
          <span aria-label={`${rows.length} active notifications and reminders`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#E34242] px-1.5 font-montserrat text-[11px] font-semibold leading-5 text-white">{rows.length}</span>
        </div>
        <button type="button" onClick={() => onOpen()} className="shrink-0 font-montserrat text-[12px] font-semibold text-[#007EA7] hover:text-[#006B8E]">View all</button>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center font-montserrat text-[12px] leading-[18px] text-[#7288A3]">No notifications or reminders need your attention.</p>
      ) : (
        <ul className="divide-y divide-[#E1EBF2]">
          {rows.slice(0, 3).map(row => {
            const Icon = row.category === "reminders" ? Bell : AlertCircle;
            return (
              <li key={`${row.category}:${row.id}`} className="grid min-h-12 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-2 md:grid-cols-[32px_minmax(140px,1fr)_minmax(0,2fr)_auto]">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${row.category === "reminders" ? "bg-[#FFF7E1] text-[#D79500]" : "bg-[#FFF0F1] text-[#E34242]"}`}><Icon size={16} aria-hidden="true" /></span>
                <div className="min-w-0 font-montserrat text-[12px] leading-[18px]">
                  <p className="break-words font-medium text-[#10233A]">{row.name}</p>
                  <p className="text-[11px] font-normal text-[#7288A3]">{row.category === "reminders" ? "Reminder" : "Notification"} · {row.type}</p>
                </div>
                <p className="col-start-2 row-start-2 min-w-0 break-words font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3] md:col-start-3 md:row-start-1">{row.message}</p>
                <button type="button" onClick={() => onOpen(row.category, row.name)} aria-label={`Open ${row.name}`} className="col-start-3 row-start-1 inline-flex h-8 min-w-[76px] items-center justify-center rounded-lg border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[12px] font-semibold text-[#007EA7] transition-colors hover:bg-[#E6F2F6] md:col-start-4">Open</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
