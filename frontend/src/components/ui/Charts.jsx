import { useState } from 'react';

// One series per chart, so a single hue; the values are always written out.
const MARK = '#0A8F8A';

function TableView({ caption, items }) {
  return (
    <details className='mt-3 text-xs text-[#64748B]'>
      <summary className='cursor-pointer font-medium'>Ver como tabla</summary>
      <table className='mt-2 w-full text-left'>
        <caption className='sr-only'>{caption}</caption>
        <thead><tr className='border-b border-[#E8EDF2]'><th scope='col' className='py-1.5 font-medium'>Categoría</th><th scope='col' className='py-1.5 text-right font-medium'>Valor</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.label} className='border-b border-[#F1F5F9]'><td className='py-1.5'>{item.label}</td><td className='py-1.5 text-right tabular-nums'>{item.value}{item.hint ? ` · ${item.hint}` : ''}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

/** Horizontal bars with the value at the tip. For magnitudes and funnels. */
export function BarChart({ caption, items }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <figure className='m-0'>
      <div className='space-y-3' role='img' aria-label={`${caption}: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`}>
        {items.map((item) => (
          <div key={item.label} onMouseEnter={() => setActive(item.label)} onMouseLeave={() => setActive(null)} className='grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-3'>
            <span className='truncate text-xs text-[#475569]' title={item.label}>{item.label}</span>
            <div className='relative flex min-h-6 items-center gap-2'>
              {item.value > 0 && <span className='h-4 rounded-r' style={{ width: `calc((100% - 3rem) * ${item.value / max})`, background: MARK }} />}
              <span className='text-xs font-semibold tabular-nums text-[#10233A]'>{item.value}</span>
              {active === item.label && item.hint && <span role='tooltip' className='absolute bottom-full left-0 z-10 mb-1 whitespace-nowrap rounded-md bg-[#10233A] px-2 py-1 text-[11px] text-white shadow'>{item.label}: {item.hint}</span>}
            </div>
          </div>
        ))}
      </div>
      <TableView caption={caption} items={items} />
    </figure>
  );
}

/** Columns over time. Only the highest and the latest carry a label; hover shows the rest. */
export function ColumnChart({ caption, items, height = 140 }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...items.map((item) => item.value));
  const peak = items.reduce((best, item, index) => (item.value > (items[best]?.value ?? -1) ? index : best), 0);
  return (
    <figure className='m-0'>
      <div role='img' aria-label={`${caption}: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`}>
        <div className='flex items-end gap-0.5 border-b border-[#E8EDF2]' style={{ height: height + 20 }}>
          {items.map((item, index) => (
            <div key={item.label} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} className='relative flex h-full min-w-0 flex-1 flex-col items-center justify-end'>
              {(active === index || index === peak || index === items.length - 1) && <span className='mb-0.5 text-[11px] font-semibold tabular-nums text-[#10233A]'>{item.value}</span>}
              {item.value > 0 && <span className='w-full max-w-6 rounded-t' style={{ height: Math.max(2, (item.value / max) * height), background: MARK }} />}
            </div>
          ))}
        </div>
        <div className='mt-1.5 flex gap-0.5'>{items.map((item) => <span key={item.label} className='min-w-0 flex-1 text-center text-[10px] text-[#64748B]'>{item.short || item.label}</span>)}</div>
      </div>
      <TableView caption={caption} items={items} />
    </figure>
  );
}

export function ChartCard({ title, description, children }) {
  return (
    <section className='rounded-2xl border border-[#DDE8F2] bg-white p-5 shadow-sm'>
      <h3 className='font-display font-bold text-[#10233A]'>{title}</h3>
      {description && <p className='mt-1 text-xs text-[#64748B]'>{description}</p>}
      <div className='mt-4'>{children}</div>
    </section>
  );
}
