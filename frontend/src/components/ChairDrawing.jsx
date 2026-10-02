export function ChairDrawing({ wire = false }) {
  return <svg className="chair-drawing" viewBox="0 0 280 300" fill="none" aria-hidden="true">
    <ellipse cx="143" cy="269" rx="76" ry="12" fill="currentColor" opacity=".08" />
    <g stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill={wire ? 'none' : 'currentColor'}>
      <path d="m81 166-19 94 7 4 28-91M177 176l26 90 7-3-19-94M110 157l-4 84 7 3 8-81M209 133l11 99 7-2-6-101" />
      <path d="M79 139c-3-3-3-7 2-9l34-16 83 17c15-21 10-55 13-88 1-12-6-14-15-12l-76 17c-7 2-10 7-10 16l-1 42c0 20-11 27-30 33Z" fillOpacity={wire ? 0 : .55} />
      <path d="m76 138 72 22c20 6 37 2 48-13l15-24c-3 27-16 57-43 53l-88-25c-7-2-9-9-4-13Z" fillOpacity={wire ? 0 : .85} />
      <path d="m113 65 94-20M111 89l97-18M112 111l94-17M126 48l9 83m9-87 10 90m11-95 9 87m11-91 6 72M85 134l79 21 35-20m-95-8 78 21M87 140l23-9m5 17 26-10m0 17 24-10" fill="none" opacity={wire ? .9 : .14} strokeWidth="1" />
    </g>
  </svg>
}
