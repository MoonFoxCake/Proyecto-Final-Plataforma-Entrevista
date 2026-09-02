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

export function ArrowLeftIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M12.667 8H3.333M7.333 3.333 2.667 8l4.666 4.667" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function UserIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="5.333" r="2.667" stroke="currentColor" strokeWidth="1.333" />
      <path d="M2.667 13.333c0-2.577 2.388-4.666 5.333-4.666s5.333 2.09 5.333 4.666" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M3.14 2h2.193c.31 0 .58.213.65.516l.57 2.462a.667.667 0 0 1-.192.63L4.99 7c.71 1.512 1.933 2.798 3.409 3.409l1.393-1.372a.667.667 0 0 1 .629-.192l2.462.57c.303.07.517.34.517.65V12.86a1 1 0 0 1-1.076 1c-2.55-.174-4.95-1.28-6.756-3.086C3.756 8.966 2.65 6.567 2.475 4.017a1 1 0 0 1 1-1.017Z"
        stroke="currentColor"
        strokeWidth="1.333"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MapPinIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M13.333 6.667c0 4-5.333 7.666-5.333 7.666s-5.333-3.666-5.333-7.666a5.333 5.333 0 1 1 10.666 0Z"
        stroke="currentColor"
        strokeWidth="1.333"
      />
      <circle cx="8" cy="6.667" r="1.833" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function GraduationCapIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M1.333 5.333 8 2l6.667 3.333L8 8.667l-6.667-3.334Z" stroke="currentColor" strokeWidth="1.333" strokeLinejoin="round" />
      <path d="M4 7v3.333c0 1.105 1.79 2 4 2s4-.895 4-2V7" stroke="currentColor" strokeWidth="1.333" />
      <path d="M14.667 5.333v4" stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" />
    </svg>
  );
}

export function BriefcaseIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1.333" y="4.667" width="13.334" height="8.667" rx="1.333" stroke="currentColor" strokeWidth="1.333" />
      <path d="M5.333 4.667V3.333A1.333 1.333 0 0 1 6.667 2h2.666a1.333 1.333 0 0 1 1.334 1.333v1.334" stroke="currentColor" strokeWidth="1.333" />
      <path d="M1.333 8.667h13.334" stroke="currentColor" strokeWidth="1.333" />
    </svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="m4 12.5 5.5 5.5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SpinnerIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LogOutIcon(props) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M6.333 2.667H3.667A1.333 1.333 0 0 0 2.333 4v8c0 .736.597 1.333 1.334 1.333h2.666" stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" />
      <path d="M8.667 5.333 11.333 8l-2.666 2.667M11.333 8H5.667" stroke="currentColor" strokeWidth="1.333" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
