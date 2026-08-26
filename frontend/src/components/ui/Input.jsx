/**
 * Base input component.
 *
 * With no `icon`/`rightElement`, renders exactly as before (plain bordered
 * input) so existing call sites are unaffected. Passing `icon` and/or
 * `rightElement` switches to the icon-adorned field style used by the
 * Nexo Perfil auth screens.
 *
 * @param {import('react').InputHTMLAttributes<HTMLInputElement> & { icon?: import('react').ReactNode, rightElement?: import('react').ReactNode }} props
 */
export function Input({ className = '', icon, rightElement, ...props }) {
  if (!icon && !rightElement) {
    return <input className={`rounded-md border border-neutral-300 px-3 py-2 ${className}`} {...props} />;
  }

  return (
    <div className="relative w-full">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[#99A1AF]">
          {icon}
        </span>
      )}
      <input
        className={`w-full rounded-xl border border-[#E5E7EB] py-3 text-sm text-[#101828] placeholder:text-[#99A1AF] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30 ${
          icon ? 'pl-10' : 'pl-4'
        } ${rightElement ? 'pr-11' : 'pr-4'} ${className}`}
        {...props}
      />
      {rightElement && (
        <span className="absolute right-3.5 top-1/2 flex -translate-y-1/2">{rightElement}</span>
      )}
    </div>
  );
}
