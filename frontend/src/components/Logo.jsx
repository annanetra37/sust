export function LogoMark({ className = 'w-8 h-8' }) {
  return <img src="/logo.svg" alt="Triple I" className={className} />;
}

export function LogoFull({ className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img src="/logo.svg" alt="Triple I" className="w-9 h-9" />
      <div className="flex flex-col">
        <span className="font-bold text-[15px] tracking-[0.2em] leading-tight text-gray-900 dark:text-white">
          TRIPLE I
        </span>
        <span className="text-[10px] font-medium tracking-widest text-brand-600 dark:text-brand-400">
          ESG PORTAL
        </span>
      </div>
    </div>
  );
}

export function LogoIcon({ className = 'w-6 h-6' }) {
  return <img src="/logo.svg" alt="Triple I" className={className} />;
}
