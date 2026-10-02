import { Link, useLocation } from 'react-router-dom'
import { Arrow, Mark } from '../components/Icons'

const descriptions = {
  '/reconstruct': { title: 'From your image. Soon.', text: 'Image upload and model inference are the next parts of this experience. The landing-page chair is an illustration, not a generated result.' },
}

export function ComingNext() {
  const { pathname } = useLocation()
  const content = descriptions[pathname] ?? (pathname.startsWith('/result/')
    ? { title: 'No reconstruction to show.', text: 'The result viewer will display actual model outputs after inference is integrated. No result has been loaded for this address.' }
    : { title: 'A different perspective?', text: 'This page does not exist. Head back to explore the reconstruction concept.' })
  return <section className="coming-page"><Mark className="coming-mark" /><p className="eyebrow">APPLICATION PREVIEW</p><h1>{content.title}</h1><p>{content.text}</p><Link className="button primary" to="/">Back to the experience <Arrow /></Link></section>
}
