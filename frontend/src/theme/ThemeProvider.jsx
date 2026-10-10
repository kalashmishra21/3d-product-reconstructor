import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { readTheme, resolveTheme, storeTheme, THEME_KEY } from './theme.js'

const ThemeContext = createContext(null)
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const boot = document.documentElement.dataset.theme
    if (boot === 'forest' || boot === 'ivory') return boot
    try { return readTheme(window.localStorage, matchMedia('(prefers-color-scheme: dark)').matches) }
    catch { return 'forest' }
  })
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'ivory' ? 'light' : 'dark'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'forest' ? '#142019' : '#eeeade')
  }, [theme])
  useEffect(() => {
    const sync = event => {
      if (event.key === THEME_KEY || event.key === null) setTheme(resolveTheme(event.newValue, matchMedia('(prefers-color-scheme: dark)').matches))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const chooseTheme = value => {
    setTheme(value)
    try { storeTheme(window.localStorage, value) } catch { /* Browser storage can be unavailable. */ }
  }
  return <ThemeContext.Provider value={{ theme, setTheme: chooseTheme }}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider is required')
  return value
}
