const VARIANTS = {
  // Original placeholder styling — unchanged, so existing call sites keep
  // their exact look.
  secondary: 'rounded-md bg-secondary px-4 py-2 text-white',
  // Solid accent-teal pill button used by the Nexo Perfil auth screens.
  accent:
    'rounded-xl bg-[#0AADA8] text-sm font-semibold text-white transition-colors hover:bg-[#089490] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
  // Secondary action alongside an accent button, e.g. a wizard's "back" step.
  outline:
    'rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#4B5563] transition-colors hover:bg-[#F9FAFB] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30 disabled:cursor-not-allowed disabled:opacity-60',
};

/**
 * Base button component.
 *
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'secondary' | 'accent' }} props
 */
export function Button({ children, className = '', variant = 'secondary', ...props }) {
  return (
    <button className={`inline-flex items-center justify-center gap-2 ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
