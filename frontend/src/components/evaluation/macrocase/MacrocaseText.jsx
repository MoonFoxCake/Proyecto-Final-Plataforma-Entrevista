/** Splits a macrocase `introduction` into paragraphs (blank-line separated). */
export function toParagraphs(text = '') {
  return text.split(/\r?\n\s*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/** Case text, with dialogue lines (starting with an em dash) set off slightly. */
export function MacrocaseText({ text, className = '' }) {
  return (
    <div className={`space-y-4 text-[15px] leading-7 text-[#334E68] ${className}`}>
      {toParagraphs(text).map((paragraph, index) => (
        <p key={index} className={paragraph.startsWith('—') ? 'pl-4 text-[#10233A]' : ''}>{paragraph}</p>
      ))}
    </div>
  );
}
