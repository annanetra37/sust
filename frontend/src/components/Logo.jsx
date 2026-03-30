import { useTheme } from '../context/ThemeContext';

export function LogoMark({ className = 'w-10 h-10' }) {
  const { dark } = useTheme();
  return <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className={className} />;
}

export function LogoFull({ className = '' }) {
  const { dark } = useTheme();
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className="w-11 h-11" />
      <div className="flex flex-col">
        <span className="font-bold text-[17px] tracking-[0.2em] leading-tight text-gray-900 dark:text-white">
          TRIPLE I
        </span>
        <span className="text-[11px] font-medium tracking-widest text-brand-600 dark:text-brand-400">
          ESG PORTAL
        </span>
      </div>
    </div>
  );
}

export function LogoIcon({ className = 'w-8 h-8' }) {
  const { dark } = useTheme();
  return <img src={dark ? '/logo-white.svg' : '/logo.svg'} alt="Triple I" className={className} />;
}
