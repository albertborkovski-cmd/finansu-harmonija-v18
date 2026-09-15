import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TablePagination from '../src/components/TablePagination';
import { TABLE_BATCH_SIZE } from '../src/lib/tablePaging';
import '../src/index.css';

/** Isolated browser fixture: no authentication, API calls or application data. */
export default function Fixture() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(137);
  const [nested, setNested] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const rows = Array.from({ length: total }, (_, index) => index + 1).slice(0, page * TABLE_BATCH_SIZE);
  return <main style={{ padding: 24 }}>
    <h1>Infinite table regression fixture</h1>
    <button id="filter" onClick={() => { setTotal(12); setPage(1); }}>Filter to 12</button>
    <button id="reset" onClick={() => { setTotal(137); setPage(1); if (ref.current) ref.current.scrollTop = 0; }}>Reset</button>
    <button id="mode" onClick={() => { setNested(value => !value); setPage(1); }}>Toggle scroll mode</button>
    <output id="count">{rows.length}</output>
    <div ref={ref} id="rows" style={{ height: nested ? 300 : undefined, overflowY: nested ? 'auto' : 'visible' }}>
      <div>{rows.map(row => <div data-row={row} key={row} style={{ height: 30 }}>Record {row}</div>)}</div>
    </div>
    <TablePagination scrollRef={ref} currentPage={page} totalPages={Math.ceil(total / TABLE_BATCH_SIZE)} itemCount={total} onPageChange={setPage} />
  </main>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
