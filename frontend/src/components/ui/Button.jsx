/**
 * Base button component. Placeholder styling only — no variants yet.
 *
 * @param {import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ children, className = '', ...props }) {
  return (
    <button
      className={`rounded-md bg-secondary px-4 py-2 text-white ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
