export function SisLogo({
  className = '',
  showSubtitle = false,
}: {
  className?: string;
  showSubtitle?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Open Library Book / Technical Folio Emblem */}
        <path
          d="M5 9.5C5 8.11929 6.11929 7 7.5 7H13.5C15.7091 7 17.5 8.79086 17.5 11V28.5C17.5 27.1193 16.3807 26 15 26H7.5C6.11929 26 5 24.8807 5 23.5V9.5Z"
          fill="#1B56B8"
        />
        <path
          d="M31 9.5C31 8.11929 29.8807 7 28.5 7H22.5C20.2909 7 18.5 8.79086 18.5 11V28.5C18.5 27.1193 19.6193 26 21 26H28.5C29.8807 26 31 24.8807 31 23.5V9.5Z"
          fill="#2563EB"
        />
        <path
          d="M8.5 11.5H14M8.5 15.5H14M8.5 19.5H12.5"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M22 11.5H27.5M22 15.5H27.5M23.5 19.5H27.5"
          stroke="#F6C343"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M6.5 29.2C10.5 27.6 14.5 27.9 18 30C21.5 27.9 25.5 27.6 29.5 29.2"
          stroke="#1B56B8"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="flex flex-col leading-none text-left">
        <span className="font-display text-lg font-extrabold tracking-tight text-[#1B56B8]">
          THƯ VIỆN SIS
        </span>
        {showSubtitle && (
          <span className="text-[11px] font-medium text-slate-500 mt-0.5 hidden sm:block">
            Tri thức kết nối - Kho bản vẽ kỹ thuật
          </span>
        )}
      </span>
    </span>
  );
}
