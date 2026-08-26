/**
 * Label + control + inline error, the repeated shape of a form row.
 * `children` is the input/select itself (already styled).
 *
 * @param {{ label: string, htmlFor?: string, error?: string, children: import('react').ReactNode }} props
 */
export function FormField({ label, htmlFor, error, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[#364153]">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
