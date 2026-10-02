export function Mark(props) {
  return <svg viewBox="0 0 32 36" fill="none" aria-hidden="true" {...props}><path d="m16 2 14 8v16l-14 8L2 26V10Z M2 10l14 8 14-8M16 18v16M16 2v16M2 26l14-8 14 8" stroke="currentColor" strokeWidth="1.4" /></svg>
}

export function Arrow({ diagonal = false, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}><path d={diagonal ? 'M5 19 19 5M5 5h14v14' : 'M4 12h16m-7-7 7 7-7 7'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export function Rotate({ reverse = false, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props} style={{ transform: reverse ? 'scaleX(-1)' : undefined }}><path d="M19 9a7 7 0 1 0 .5 5M19 4v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
