import { ChevronRight, ZoomIn, RefreshCw } from 'lucide-react';

const METRICS = [
  { label: 'Key precisions', value: null },
  { label: 'Keys recall', value: null },
  { label: 'Key values', value: null },
  { label: 'Model values', value: null },
  { label: 'Model precision', value: null },
  { label: 'Model recall', value: null },
];

export default function StatsTab() {
  return (
    <div className="flex flex-col gap-6 flex-1">
      {/* Toolbar */}
      <div className="flex flex-row flex-wrap items-center gap-3 flex-shrink-0">
        {/* Versions dropdown */}
        <div className="flex items-center justify-between h-8 px-3 border border-[#D3E1EC] rounded-md bg-white cursor-pointer min-w-[140px]">
          <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">All versions</span>
          <ChevronRight size={12} className="text-[#7288A3] rotate-90" />
        </div>

        {/* Keys grouping */}
        <div className="flex items-center justify-between h-8 px-3 border border-[#D3E1EC] rounded-md bg-white cursor-pointer min-w-[180px]">
          <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">Multiple keys grouping type</span>
          <ChevronRight size={12} className="text-[#7288A3] rotate-90" />
        </div>

        {/* Time period */}
        <div className="flex items-center justify-between h-8 px-3 border border-[#D3E1EC] rounded-md bg-white cursor-pointer min-w-[120px]">
          <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">Last 30 days</span>
          <ChevronRight size={12} className="text-[#7288A3] rotate-90" />
        </div>

        {/* Interval */}
        <div className="flex items-center justify-between h-8 px-3 border border-[#D3E1EC] rounded-md bg-white cursor-pointer min-w-[100px]">
          <span className="font-montserrat font-medium text-[12px] leading-[18px] text-[#10233A]">Daily</span>
          <ChevronRight size={12} className="text-[#7288A3] rotate-90" />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button type="button" aria-label="Zoom metrics in" className="w-8 h-8 flex items-center justify-center border border-[#D3E1EC] rounded-md hover:border-[#007EA7] transition-colors">
            <ZoomIn size={14} className="text-[#7288A3]" />
          </button>
          <button type="button" title="REFRESH ALL" aria-label="Refresh all metrics" className="w-8 h-8 flex items-center justify-center border border-[#D3E1EC] rounded-md hover:border-[#007EA7] transition-colors">
            <RefreshCw size={14} className="text-[#7288A3]" />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
        {METRICS.map((metric) => (
          <div
            key={metric.label}
            className="flex flex-col border border-[#E5EDF9] rounded-xl overflow-hidden min-h-[200px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5EDF9]">
              <span className="font-montserrat font-semibold text-[14px] leading-5 text-[#10233A]">{metric.label}</span>
            </div>

            {/* Chart area */}
            <div className="flex-1 flex items-center justify-center p-4">
              <span className="font-montserrat font-medium text-[14px] leading-5 text-[#A1B6C6]">No data</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
