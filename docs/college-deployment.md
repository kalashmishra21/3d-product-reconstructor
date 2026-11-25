# College deployment

This repository can first be published as a static research prototype. The public gallery contains saved model predictions. It does not run inference when a visitor uploads an image. The separate FastAPI service currently starts the historical Pixel2Mesh worker, not the six-category model.

## Publication gate

The six source identities and CC BY 4.0 licenses were verified against local source metadata, the Amazon Berkeley Objects license, and the two live Sketchfab object records on 2026-11-25. The gallery includes a public attribution link. Recheck source permissions if any asset is replaced; do not publish source GLBs, GT meshes, or model weights.

## Cloudflare Pages settings

| Setting | Value |
| --- | --- |
| Repository | kalashmishra21/3d-product-reconstructor |
| Production branch | main after review and merge |
| Root directory | frontend |
| Framework preset | React (Vite) |
| Install command | npm ci |
| Build command | npm run build |
| Output directory | dist |
| Node version | 22.18.0 or compatible newer Node 22 |
| Variables for public gallery | None |
| Variables for authenticated pages | VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, both public client settings |
| SPA routing | Cloudflare Pages serves index.html for unknown routes when no top-level 404.html exists |
| Region | Cloudflare global edge |

In Cloudflare Dashboard select Workers & Pages, Create, Pages, Connect to Git, and this repository. Enter the settings above. Set NODE_VERSION=22.18.0 if the build environment needs it. Add only public Supabase client configuration if authenticated pages will be enabled. Configure the Pages URL as an allowed Supabase redirect origin before enabling login. Review a preview deployment before merging to main. These settings do not deploy the backend or checkpoint.

The gallery uses six input PNGs, six genuine 2,048-point PLYs and six predicted open visible-surface OBJs. It does not claim complete hidden surfaces or live inference. Never publish source GLBs, GT meshes, research datasets or model checkpoints as gallery assets.

## Later inference service

The backend root is backend. Install with python -m pip install . and start with uvicorn app.main:app --host 0.0.0.0 --port $PORT. Probe /api/v1/health. Python 3.11 is compatible with pyproject.toml. Health checks the API process, not model readiness. The worker currently requires a separate Pixel2Mesh environment, an ignored local checkpoint and a 180-second response timeout. Do not deploy it as six-category inference until CPU memory, latency, correct model loading, authentication, storage, API routing and artifact cleanup are verified.

Supabase already supplies authentication, PostgreSQL records and private artifact storage for the local application. A second database is unnecessary for the static gallery. Future inference can preserve a stable public API while model versions change behind it. Do not store weights or meshes in relational rows.

## College URL verification

1. Confirm the public source-attribution link and redistribution rights for every gallery asset.
2. Run npm ci, npm test and npm run build from frontend.
3. Open the public root and refresh /model-gallery directly.
4. Check six RGB, PLY and OBJ responses, rotation/zoom and downloads.
5. Confirm the site states that gallery predictions are precomputed and upload inference is unavailable.
6. Confirm no secrets, model weights, private assets or local paths are present in the deployed files.
