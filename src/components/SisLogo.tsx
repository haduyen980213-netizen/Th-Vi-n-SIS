export function SisLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="6" fill="#142C48" />
        <path
          d="M7 9.5H15.5V13H10.5V14.5H15.5V22.5H7V19H12V17.5H7V9.5Z"
          fill="#FFFFFF"
        />
        <rect x="17.5" y="9.5" width="3.5" height="13" fill="#F2C94C" />
        <path
          d="M23 9.5H26.5V19H23V9.5ZM23 20.5H26.5V22.5H23V20.5Z"
          fill="#FFFFFF"
        />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight text-[#142C48]">
        THƯ VIỆN SIS
      </span>
    </span>
  );
}
