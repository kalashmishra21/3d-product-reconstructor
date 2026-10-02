const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  plus: 'M12 4v16M4 12h16',
  history: 'M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2',
  model: 'm12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5M12 12v10M12 2v10',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  logout: 'M9 3H4v18h5M9 12h12m-4-4 4 4-4 4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M15 8h.01',
  chevron: 'm8 10 4 4 4-4',
}

export function DashboardIcon({ name, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] ?? paths.model} /></svg>
}
