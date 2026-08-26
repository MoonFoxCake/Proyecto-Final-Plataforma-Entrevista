import { ChevronDownIcon } from '../auth/icons.jsx';

/**
 * Bordered select styled to match {@link Input}: optional left icon, native
 * `<select>` underneath with a custom chevron (native arrow removed via
 * `appearance-none`).
 *
 * @param {import('react').SelectHTMLAttributes<HTMLSelectElement> & { icon?: import('react').ReactNode, placeholder?: string }} props
 */
export function Select({ className = '', icon, placeholder, children, ...props }) {
  return (
    <div className="relative w-full">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[#99A1AF]">
          {icon}
        </span>
      )}
      <select
        className={`w-full appearance-none rounded-xl border border-[#E5E7EB] bg-white py-3 pr-10 text-sm text-[#101828] outline-none focus:border-[#0AADA8] focus:ring-2 focus:ring-[#0AADA8]/30 ${
          icon ? 'pl-10' : 'pl-4'
        } ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#99A1AF]" />
    </div>
  );
}
