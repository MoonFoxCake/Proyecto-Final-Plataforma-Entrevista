const TONES = {
  muted: ['bg-[#F1F5F9] text-[#475569]', 'bg-[#94A3B8]'],
  info: ['bg-[#EEF6FF] text-[#315B88]', 'bg-[#4F8CC9]'],
  ok: ['bg-[#E8F8F5] text-[#087D79]', 'bg-[#0AADA8]'],
  warning: ['bg-[#FFF7E8] text-[#9A651E]', 'bg-[#D99A2B]'],
  error: ['bg-red-50 text-red-700', 'bg-red-500'],
};

/**
 * Status label: the text carries the meaning, the colour only reinforces it.
 *
 * @param {{ tone?: keyof typeof TONES, title?: string, children: import('react').ReactNode }} props
 */
export function StatusBadge({ tone = 'muted', title, children }) {
  const [box, dot] = TONES[tone] || TONES.muted;
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${box}`}>
      <span aria-hidden='true' className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
