import { useEffect, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import { SaveButton } from './ScopedActionButtons';

export interface ColConfig {
  key: string;
  label: string;
  width: number;
  visible: boolean;
}

interface Props {
  columns: ColConfig[];
  defaultColumns?: ColConfig[];
  onSave: (cols: ColConfig[]) => void;
  onClose: () => void;
  showSearch?: boolean;
}

interface DragPreview {
  left: number;
  top: number;
  width: number;
  pointerOffsetY: number;
}

function DragHandle() {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className="flex-shrink-0">
      <line x1="2" y1="2" x2="14" y2="2" stroke="#A1B6C6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="7" x2="14" y2="7" stroke="#A1B6C6" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="12" x2="14" y2="12" stroke="#A1B6C6" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * System-wide column settings pattern.
 * Every new table must reuse this component so checkbox styling, drag feedback,
 * ordering, search and footer actions stay synchronized across the application.
 */
export default function ColumnSettingsPanel({ columns, defaultColumns, onSave, onClose, showSearch = true }: Props) {
  const [draft, setDraft] = useState<ColConfig[]>(() => columns.map(c => ({ ...c })));
  const [search, setSearch] = useState('');
  const dragIdx = useRef<number | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const filtered = search
    ? draft.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
    : draft;

  function toggleVisible(key: string) {
    setDraft(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  }

  const allVisible = draft.length > 0 && draft.every(column => column.visible);
  const someVisible = draft.some(column => column.visible) && !allVisible;

  function toggleAllVisible() {
    setDraft(previous => previous.map(column => ({ ...column, visible: !allVisible })));
  }

  function handlePointerDown(e: React.PointerEvent, idx: number, key: string) {
    if (!showDraggable || e.button !== 0) return;
    const row = e.currentTarget.closest<HTMLElement>('[data-column-index]');
    if (!row) return;

    const rect = row.getBoundingClientRect();
    e.preventDefault();
    dragIdx.current = idx;
    setDraggingKey(key);
    setDragPreview({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      pointerOffsetY: e.clientY - rect.top,
    });
  }

  useEffect(() => {
    if (draggingKey === null) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragPreview(prev => prev ? { ...prev, top: event.clientY - prev.pointerOffsetY } : prev);

      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-column-index]');
      if (!target) return;

      const to = Number(target.dataset.columnIndex);
      const from = dragIdx.current;
      if (!Number.isInteger(to) || from === null || from === to) return;

      setDraft(prev => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
      dragIdx.current = to;
    };

    const handlePointerUp = () => {
      dragIdx.current = null;
      setDraggingKey(null);
      setDragPreview(null);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp, { once: true });
    document.addEventListener('pointercancel', handlePointerUp, { once: true });

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingKey]);

  function handleDefault() {
    const base = defaultColumns ?? columns;
    setDraft(base.map(c => ({ ...c })));
    setSearch('');
  }

  const showDraggable = !search;
  const draggingColumn = draggingKey ? draft.find(column => column.key === draggingKey) : null;

  return (
    <div
      data-column-settings-overlay="true"
      className="fixed inset-0 z-50"
      onPointerDown={onClose}
    >
    <div
      className="absolute right-0 top-0 flex h-screen w-[340px] flex-col bg-white"
      style={{ boxShadow: '-2px 0px 0px #E5EDF9' }}
      onPointerDown={event => event.stopPropagation()}
    >
      {/* Header */}
      <div className="flex flex-row justify-between items-start px-6 pt-6 flex-shrink-0">
        <span className="font-montserrat font-semibold text-[22px] leading-[32px] text-[#10233A]">Column settings</span>
        <button type="button" aria-label="Close column settings" onClick={onClose} className="flex h-6 w-6 items-center justify-center text-[#7288A3] hover:text-[#10233A] transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-6 flex-1 min-h-0 overflow-hidden">
        {/* Search */}
        {showSearch && <div className="flex flex-row items-center justify-between px-3 py-[7px] bg-white border border-[#D3E1EC] rounded-lg w-full flex-shrink-0">
          <input
            aria-label="Search columns"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search"
            className="font-montserrat font-medium text-[14px] leading-5 text-[#10233A] placeholder-[#7288A3] outline-none flex-1 bg-transparent"
          />
          <Search size={16} className="text-[#7288A3] flex-shrink-0" />
        </div>}

        {/* Master checkbox applies to every column, not only search results. */}
        <button
          type="button"
          aria-pressed={allVisible}
          data-partially-selected={someVisible ? 'true' : 'false'}
          aria-label={allVisible ? 'Unselect all columns' : 'Select all columns'}
          onClick={toggleAllVisible}
          className="grid h-9 w-full flex-shrink-0 grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-0 text-left transition-colors hover:bg-[#F8FDFF]"
        >
          {/* Keep the master row on the exact same grid as draggable rows. */}
          <span aria-hidden="true" className="h-[14px] w-4" />
          <span
            className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px] transition-colors"
            style={allVisible || someVisible
              ? { backgroundColor: '#007EA7' }
              : { backgroundColor: 'transparent', border: '1px solid #A1B6C6' }
            }
          >
            {(allVisible || someVisible) && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1.5 5.5L4.75 8.25L10.5 2.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="font-montserrat text-[14px] font-semibold leading-5 text-[#10233A]">
            All columns
          </span>
          <span className="font-montserrat text-[12px] font-medium leading-[18px] text-[#7288A3]">
            {allVisible ? 'Unselect all' : 'Select all'}
          </span>
        </button>

        {/* Column list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {(showDraggable ? draft : filtered).map((col, idx) => (
            <div
              key={col.key}
              data-column-index={idx}
              className={`grid h-9 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-2 rounded border px-0 py-2 select-none cursor-default transition-colors ${draggingKey === col.key ? 'border-dashed border-[#007EA7] bg-[#E5EDF9] opacity-40' : 'border-transparent'}`}
            >
              {/* Drag handle */}
              <div
                aria-label={`Drag ${col.label} column`}
                onPointerDown={e => handlePointerDown(e, idx, col.key)}
                className={showDraggable ? 'flex h-[14px] w-4 cursor-grab items-center justify-center touch-none active:cursor-grabbing' : 'flex h-[14px] w-4 items-center justify-center opacity-0 pointer-events-none'}
              >
                <DragHandle />
              </div>

              {/* Checkbox */}
              <button
                type="button"
                aria-label={`${col.visible ? 'Hide' : 'Show'} ${col.label} column`}
                onClick={() => toggleVisible(col.key)}
                className="w-[18px] h-[18px] rounded-[6px] flex-shrink-0 flex items-center justify-center transition-colors"
                style={col.visible
                  ? { backgroundColor: '#007EA7' }
                  : { backgroundColor: 'transparent', border: '1px solid #A1B6C6' }
                }
              >
                {col.visible && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1.5 5.5L4.75 8.25L10.5 2.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Label */}
              <span className="min-w-0 flex-1 truncate font-montserrat font-medium text-[14px] leading-5 text-[#7288A3]">
                {col.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* One shared drag preview keeps reordering feedback identical system-wide. */}
      {draggingColumn && dragPreview && (
        <div
          aria-hidden="true"
          className="fixed z-[60] flex h-9 flex-row items-center gap-2 rounded-md border border-[#A1B6C6] bg-white px-2 py-2 pointer-events-none"
          style={{
            left: dragPreview.left,
            top: dragPreview.top,
            width: dragPreview.width,
            boxShadow: '0 8px 24px rgba(16, 35, 58, 0.18)',
          }}
        >
          <DragHandle />
          <span
            className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[6px]"
            style={draggingColumn.visible
              ? { backgroundColor: '#007EA7' }
              : { backgroundColor: 'transparent', border: '1px solid #A1B6C6' }
            }
          >
            {draggingColumn.visible && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1.5 5.5L4.75 8.25L10.5 2.75" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
          <span className="min-w-0 flex-1 truncate font-montserrat text-[14px] font-medium leading-5 text-[#10233A]">
            {draggingColumn.label}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-row justify-between items-start gap-4 px-6 pb-8 flex-shrink-0">
        <button
          type="button"
          onClick={handleDefault}
          className="flex h-[42px] items-center justify-center font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3] hover:text-[#10233A] transition-colors"
        >
          Default
        </button>
        <div className="flex flex-row items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[42px] items-center justify-center px-4 py-[9px] border-2 border-[#D3E1EC] rounded-lg bg-white hover:border-[#007EA7] transition-colors"
          >
            <span className="font-montserrat font-semibold text-[16px] leading-6 text-[#7288A3]">Cancel</span>
          </button>
          <SaveButton onClick={() => { onSave(draft); onClose(); }} />
        </div>
      </div>
    </div>
    </div>
  );
}
