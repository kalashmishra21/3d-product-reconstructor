export function SourceView({ src, filename, width, height }) {
  return <div className="source-view" role="group" aria-label="Source image inspection">
    <div className="source-view-image">
      <img src={src} alt={filename ? `Source image: ${filename}` : 'Selected source image'} />
    </div>
    <div className="source-view-caption">
      <span>ORIGINAL SOURCE / NO MODEL GEOMETRY</span>
      <span>{filename || 'Selected image'}{width && height ? ` · ${width} × ${height}` : ''}</span>
    </div>
  </div>
}
