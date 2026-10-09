import { useTheme } from './ThemeProvider.jsx'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const light = theme === 'ivory'
  const label = light ? 'Switch to Dark Forest Studio' : 'Switch to Light Ivory Atelier'
  return <button className="theme-toggle" type="button" onClick={() => setTheme(light ? 'forest' : 'ivory')} aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">{light ? <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>}</svg>
    <span>{light ? 'Forest studio' : 'Ivory atelier'}</span>
  </button>
}
