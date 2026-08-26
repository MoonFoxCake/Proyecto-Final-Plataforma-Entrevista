/**
 * Inline stroke icons used by the auth screens. Kept local (rather than a
 * dependency) since only a handful are needed and Figma exports them as
 * simple 1.33px-stroke paths.
 */

export function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M6 1L10.5 2.8V5.6C10.5 8.2 8.6 10.5 6 11C3.4 10.5 1.5 8.2 1.5 5.6V2.8L6 1Z"
        stroke="currentColor"
      />
    </svg>
  );
}

export function MailIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M1.333 4.667c0-.737.597-1.334 1.334-1.334h10.666c.737 0 1.334.597 1.334 1.334v6.666c0 .737-.597 1.334-1.334 1.334H2.667c-.737 0-1.334-.597-1.334-1.334V4.667Z"
        stroke="currentColor"
        strokeWidth="1.333"
      />
      <path
        d="m1.667 4.333 5.63 4.096a1.15 1.15 0 0 0 1.406 0l5.63-4.096"
        stroke="currentColor"
        strokeWidth="1.333"
      />
    </svg>
  );
}

export function LockIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2.667" y="7.333" width="10.667" height="6.667" rx="1.333" stroke="currentColor" strokeWidth="1.333" />
      <path d="M4.667 7.333V4.667a3.333 3.333 0 1 1 6.666 0v2.666" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function EyeIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M1.333 8S3.556 3.333 8 3.333 14.667 8 14.667 8 12.444 12.667 8 12.667 1.333 8 1.333 8Z"
        stroke="currentColor"
        strokeWidth="1.333"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function EyeOffIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M2 2l12 12M6.7 6.77A2 2 0 0 0 8 10a2 2 0 0 0 1.94-1.51M4.14 4.16C2.6 5.16 1.33 8 1.33 8s2.223 4.667 6.667 4.667c1.02 0 1.9-.244 2.65-.62M9.9 3.53A6.9 6.9 0 0 0 8 3.333c-.53 0-1.03.06-1.5.166M13.06 11.06C14.15 10.06 14.667 8 14.667 8s-.55-1.176-1.6-2.28"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3.333 8h9.334M8.667 3.333 13.333 8l-4.666 4.667" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}
