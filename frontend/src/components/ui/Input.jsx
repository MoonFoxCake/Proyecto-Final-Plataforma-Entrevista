/**
 * Base input component. Placeholder styling only.
 *
 * @param {import('react').InputHTMLAttributes<HTMLInputElement>} props
 */
export function Input({ className = '', ...props }) {
  return (
    <input
      className={`rounded-md border border-neutral-300 px-3 py-2 ${className}`}
      {...props}
    />
  );
}
