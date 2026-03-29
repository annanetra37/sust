export function LogoMark({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Triple I triangular mark */}
      <path d="M20 2L36 34H4L20 2Z" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M20 10L30 30H10L20 10Z" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="20" cy="22" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function LogoFull({ className = '', dark = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={`w-9 h-9 ${dark ? 'text-white' : 'text-gray-900 dark:text-white'}`} />
      <div className="flex flex-col">
        <span className={`font-bold text-[15px] tracking-wider leading-tight ${dark ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
          TRIPLE I
        </span>
        <span className={`text-[10px] font-medium tracking-widest ${dark ? 'text-white/60' : 'text-emerald-600 dark:text-emerald-400'}`}>
          ESG PORTAL
        </span>
      </div>
    </div>
  );
}

export function LogoIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2L36 34H4L20 2Z" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M20 10L30 30H10L20 10Z" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="20" cy="22" r="2.5" fill="currentColor" />
    </svg>
  );
}
