import { useMemo, useState } from 'react';
import { Columns2, RefreshCw, Search, Target, Trash2, X } from 'lucide-react';
import TablePagination from '../TablePagination';
import ImportButton from '../ImportButton';

export interface ExecutionModelOption {
  id: string;
  name: string;
  version: string;
  description: string;
  status: 'Active';
}

const OPTIONS: ExecutionModelOption[] = Array.from({ length: 10 }, (_, index) => ({
  id: `execution-option-${index + 1}`,
  name: index === 0 ? 'invoice-exec-v1.3' : 'demo.catering.mailbox',
  version: index === 0 ? '1.3.0' : '0.0.13',
  description: index === 0 ? 'Invoice execution model' : 'IE HTML Invoice',
  status: 'Active',
}));

export default function ExecutionModelOptionsModal({ onClose, onSelect }: { onClose: () => void; onSelect: (option: ExecutionModelOption) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => OPTIONS.filter(option => !normalizedQuery || `${option.name} ${option.version} ${option.description} ${option.status}`.toLowerCase().includes(normalizedQuery)), [normalizedQuery]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10233A]/20 p-6" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Execution model options" className="flex h-[600px] w-[872px] max-w-[calc(100vw-32px)] flex-col gap-6 rounded-2xl bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.102)]" onMouseDown={event => event.stopPropagation()}>
        <div className="flex h-6 flex-shrink-0 items-center justify-between gap-2">
          <h2 className="font-montserrat text-[16px] font-semibold leading-6 text-[#10233A]">Execution model options</h2>
          <button type="button" aria-label="Close Execution model options" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#007EA7]"><X size={24} strokeWidth={1.8} /></button>
        </div>

        <div className="flex h-[504px] min-h-0 flex-col gap-6">
          <div className="flex h-7 flex-shrink-0 items-center justify-between gap-4">
            <label className="flex h-7 w-[260px] max-w-full items-center justify-between rounded bg-[#E5EDF9] px-2">
              <input aria-label="Search execution model options" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent font-montserrat text-[12px] font-medium leading-[18px] text-[#10233A] outline-none placeholder:text-[#7288A3]" />
              <Search size={16} className="text-[#7288A3]" />
            </label>
            <div className="flex h-7 items-center gap-4 rounded bg-white p-1.5 text-[#7288A3]">
              <button type="button" title="ALL DELETE" aria-label="Delete selected execution models" disabled className="flex h-4 w-4 items-center justify-center opacity-50"><Trash2 size={16} /></button>
              <button type="button" aria-label="Execution model columns" className="flex h-4 w-4 items-center justify-center hover:text-[#007EA7]"><Columns2 size={16} /></button>
              <ImportButton scope="Execution models" />
              <button type="button" title="REFRESH ALL" aria-label="Refresh all execution models" className="flex h-4 w-4 items-center justify-center hover:text-[#007EA7]"><RefreshCw size={16} /></button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-between gap-12">
            <div className="flex h-[396px] flex-col gap-4 overflow-hidden">
              <div className="grid h-5 grid-cols-[minmax(170px,278px)_84px_minmax(180px,250px)_minmax(90px,140px)_36px] items-center px-3 font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
                <span className="flex items-center gap-1.5 text-[#10233A]">Name</span><span>Version</span><span>Description</span><span>Status</span><span />
              </div>
              <div className="flex h-[360px] flex-col overflow-hidden">
                {filteredOptions.map((option, index) => (
                  <div key={option.id} className={`grid h-9 flex-shrink-0 grid-cols-[minmax(170px,278px)_84px_minmax(180px,250px)_minmax(90px,140px)_36px] items-center rounded-lg font-montserrat text-[12px] font-normal leading-[18px] text-[#10233A] ${index % 2 === 0 ? 'bg-[#F8FDFF]' : 'bg-white'}`}>
                    <span className="truncate px-3">{option.name}</span>
                    <span className="truncate px-[10px]">{option.version}</span>
                    <span className="truncate px-[10px]">{option.description}</span>
                    <span className="flex items-center gap-1 px-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#0ED8A8]" />{option.status}</span>
                    <span className="flex h-9 items-center p-1"><button type="button" aria-label={`Select execution model ${index + 1}`} onClick={() => onSelect(option)} className="flex h-7 w-7 items-center justify-center rounded border-2 border-[#D3E1EC] bg-white text-[#7288A3] hover:border-[#007EA7] hover:text-[#007EA7]"><Target size={16} /></button></span>
                  </div>
                ))}
                {filteredOptions.length === 0 && <div className="flex h-24 items-center justify-center font-montserrat text-[14px] font-medium text-[#7288A3]">No results found</div>}
              </div>
            </div>

            <div className="flex h-8 flex-shrink-0 items-center justify-between gap-4">
              <TablePagination currentPage={page} totalPages={5} itemCount={filteredOptions.length} onPageChange={setPage} />
              <div className="flex items-center gap-[14px]"><span className="font-montserrat text-[12px] font-normal leading-[18px] text-[#7288A3]">14 from 15,000 items</span><button type="button" className="flex h-8 items-center justify-center rounded-md border-2 border-[#D3E1EC] bg-white px-3 font-montserrat text-[14px] font-semibold leading-5 text-[#7288A3] hover:border-[#007EA7]">View all</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
