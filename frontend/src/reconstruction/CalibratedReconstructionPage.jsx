import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { api } from '../lib/api.js'
import { inspectImageFile } from './image.js'
import './calibratedReconstruction.css'

export function CalibratedReconstructionPage() {
  const [selectedImage, setSelectedImage] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [imageError, setImageError] = useState('')
  const [serviceState, setServiceState] = useState('checking')
  const [checking, setChecking] = useState(false)
  const fileInput = useRef(null)

  const checkService = useCallback(async () => {
    setChecking(true)
    try {
      const { data } = await api.get('/api/v1/readiness')
      const acceptsSingleImage = data?.input_mode === 'single_rgb' && data?.calibrated_camera_required !== true
      setServiceState(data?.ready === true && acceptsSingleImage ? 'ready' : 'unavailable')
    } catch {
      setServiceState('unavailable')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { void checkService() }, [checkService])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function chooseImage(file) {
    setImageError('')
    setSelectedImage(null)
    if (!file) return
    try {
      const inspected = await inspectImageFile(file)
      setSelectedImage(inspected)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return URL.createObjectURL(file)
      })
    } catch (error) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return ''
      })
      setImageError(error.message || 'Choose a valid image file.')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const serviceMessage = serviceState === 'checking'
    ? 'Checking reconstruction service…'
    : serviceState === 'ready'
      ? 'The single-image reconstruction service is ready.'
      : 'The reconstruction service is currently unavailable. Your image stays in this browser and no result will be generated.'

  return <main className="calibrated-reconstruction" id="main-content">
    <header className="reconstruction-heading">
      <p className="calibrated-eyebrow">IMAGE RECONSTRUCTION</p>
      <h1>Start with one image.</h1>
      <p>Choose a clear product photo to prepare a reconstruction request. The current inference engine is offline, so this page will not display a saved or substitute model.</p>
    </header>

    <div className="reconstruction-layout">
      <section className="reconstruction-upload-card" aria-labelledby="upload-title">
        <div>
          <p className="calibrated-eyebrow">YOUR INPUT</p>
          <h2 id="upload-title">Product image</h2>
          <p className="reconstruction-copy">Use a single PNG, JPEG, or WebP image, up to 10 MB. Previewing the image does not send it to the server.</p>
        </div>
        <label className="reconstruction-file-control" htmlFor="reconstruction-image">
          <span>{selectedImage ? 'Choose a different image' : 'Choose image'}</span>
          <input
            ref={fileInput}
            id="reconstruction-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => { void chooseImage(event.target.files?.[0]) }}
          />
        </label>
        {imageError && <p className="reconstruction-error" role="alert">{imageError}</p>}
        {selectedImage && <div className="reconstruction-preview-wrap">
          <img src={previewUrl} alt="Selected product image preview" className="reconstruction-preview" />
          <p>{selectedImage.width} × {selectedImage.height} pixels · {selectedImage.format}</p>
        </div>}
        <div className={'reconstruction-service-state is-' + serviceState} role="status" aria-live="polite">
          <span className="reconstruction-service-indicator" aria-hidden="true" />
          <p>{serviceMessage}</p>
        </div>
        <button className="reconstruction-submit" type="button" disabled>
          Reconstruction unavailable
        </button>
        <button className="reconstruction-retry" type="button" onClick={() => { void checkService() }} disabled={checking}>
          {checking ? 'Checking…' : 'Check service again'}
        </button>
      </section>

      <section className="reconstruction-output-card" aria-labelledby="output-title">
        <p className="calibrated-eyebrow">PREDICTED MODEL</p>
        <h2 id="output-title">Your result will appear here</h2>
        <div className="reconstruction-output-empty">
          <div className="reconstruction-output-mark" aria-hidden="true"><span /><span /><span /></div>
          <p>When an approved single-image inference engine is available, its generated mesh will be shown here for inspection and download.</p>
        </div>
        <Link className="reconstruction-history-link" to="/history">Open saved reconstruction history <Arrow diagonal /></Link>
      </section>
    </div>
  </main>
}
