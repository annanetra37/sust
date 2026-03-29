export function LogoMark({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad-left" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00C30A" />
          <stop offset="100%" stopColor="#003700" />
        </linearGradient>
        <linearGradient id="grad-right" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b6e8b8" />
          <stop offset="100%" stopColor="#003700" />
        </linearGradient>
        <linearGradient id="grad-bottom" x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor="#b6e8b8" />
          <stop offset="100%" stopColor="#c8e8ca" />
        </linearGradient>
      </defs>
      {/* Top dot */}
      <circle cx="50" cy="14" r="7" fill="#003700" />
      {/* Left bar (going from top-center down-left) */}
      <rect x="24" y="20" width="12" height="42" rx="6" transform="rotate(-25 30 41)" fill="url(#grad-left)" />
      {/* Right bar (going from top-center down-right) */}
      <rect x="55" y="26" width="12" height="42" rx="6" transform="rotate(25 61 47)" fill="url(#grad-right)" />
      {/* Bottom bar (horizontal) */}
      <rect x="24" y="76" width="52" height="12" rx="6" fill="url(#grad-bottom)" />
      {/* Bottom-left dot */}
      <circle cx="18" cy="82" r="6" fill="#003700" />
      {/* Bottom-right dot */}
      <circle cx="82" cy="82" r="6" fill="#003700" />
    </svg>
  );
}

export function LogoFull({ className = '', dark = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="w-9 h-9" />
      <div className="flex flex-col">
        <span className={`font-bold text-[15px] tracking-[0.2em] leading-tight ${dark ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
          TRIPLE I
        </span>
        <span className="text-[10px] font-medium tracking-widest text-[#00C30A] dark:text-[#4ade80]">
          ESG PORTAL
        </span>
      </div>
    </div>
  );
}

export function LogoIcon({ className = 'w-6 h-6' }) {
  return <LogoMark className={className} />;
}
