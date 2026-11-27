# Pixel3Mesh

Pixel3Mesh is a 3D reconstruction research project with a React, Vite and Three.js application, a FastAPI service, Supabase authentication, and private user history. The public frontend is [3d-product-reconstructor.pages.dev](https://3d-product-reconstructor.pages.dev/).

## Current application status

- The frontend provides landing, sign-in/sign-up, workspace, Model Explorer, image selection, account and reconstruction-history pages.
- `/reconstruct` accepts a single RGB image and previews it locally. It does not send or reconstruct that image while the inference engine is unavailable.
- FastAPI runs independently of model artifacts. `/api/v1/health` reports API liveness; `/api/v1/readiness` reports model readiness. The current local service returns 503 for readiness and inference until a compatible engine is configured.
- Supabase provides email/password and Google authentication, PostgreSQL reconstruction metadata, and private object storage. Existing history remains in the original user-owned `reconstructions` records. The additive variable-output migration is locally verified but has not been applied to hosted production.
- The saved six-category gallery remains available at `/model-gallery`. It shows saved research predictions and is not live inference.

## Original Pixel2Mesh research architecture

The Model Explorer presents the original research pipeline as a historical architecture visualization:

```text
RGB image
  → VGG16 image features
  → graph feature fusion
  → coarse ellipsoid graph deformation
  → mesh upsampling and refinement
  → three graph-deformation stages
```

The historical topology uses 156, 618 and 2,466 vertices across its three stages. This research visualization does not depict the currently active inference engine. The original source, ShapeNet loader, loss/configuration files, evaluation utilities, logs and local checkpoints remain under `Pixel2Mesh/` and `dataset_tools/`.

The selected custom six-category research bundle is preserved separately at `MyDrive/Pixel3Mesh_SixCategory_FINAL_20261126/` in the original Google Drive. Its checkpoint SHA-256 is `ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500`. It is not loaded by the current API-only service.

## Authentication and history

The frontend uses Supabase Auth for email/password, Google OAuth, password recovery and persistent sessions. Redirects are formed from the current site origin; add the corresponding `/auth/callback` URL to the Supabase redirect allowlist for local or production use. Never put a Supabase service-role key in frontend configuration.

Reconstruction records and artifacts are owner-scoped. Existing history uses the deployed `reconstructions` schema and private storage paths. `supabase/migrations/20261126170000_variable_geometry_model_outputs.sql` adds versioned records for variable-size geometry without rewriting historical rows. It has passed local RLS tests, but it must not be applied to the hosted project without explicit approval.

## Local setup

Use Python 3.11 and Node.js 22.18 or later.

1. Install the API dependencies, which do not include PyTorch:

   ```powershell
   cd backend
   py -3.11 -m venv .venv
   .venv\Scripts\python.exe -m pip install -e ".[dev]"
   cd ..
   ```

2. Set the API environment:

   ```powershell
   $env:SUPABASE_URL = "https://your-project.supabase.co"
   $env:CORS_ORIGINS = "http://127.0.0.1:5173"
   $env:RECONSTRUCTION_ENGINE = "disabled"
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
   ```

3. Copy `frontend/.env.example` to the ignored `frontend/.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL=http://127.0.0.1:8000`. The public anon key is intended for browser use; never use a service-role key here.

4. In another terminal:

   ```powershell
   cd frontend
   npm ci
   npm run dev -- --host 127.0.0.1 --port 5173
   ```

5. Add `http://127.0.0.1:5173/auth/callback` to Supabase Auth's redirect allowlist, then visit `http://127.0.0.1:5173/login` and sign in normally.

The reconstruction form accepts PNG, JPEG or WebP images up to 10 MB and displays a local preview. With the engine offline, no upload or prediction occurs. The current API contract returns 503 rather than substituting saved or ground-truth geometry.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | API liveness, independent of model state |
| GET | `/api/v1/readiness` | Model availability; returns 503 while no compatible engine is configured |
| GET | `/api/v1/me` | Identity from a verified Supabase JWT |
| POST | `/api/v1/reconstructions/preflight` | Authenticated image validation |
| POST | `/api/v1/reconstructions/infer` | Authenticated inference request; returns 503 while the engine is offline |

## Verification

Verified locally in this worktree on 27 November 2026:

- Backend: 71 tests passed.
- Frontend: 97 tests passed.
- Vite production build: passed.
- API-only Docker image: built and started. Health returned 200, readiness returned 503, and Torch was not installed. Container memory at idle was about 45 MiB on this machine; that is not a cloud measurement.
- Hosted Supabase Auth settings returned HTTP 200 with email and Google providers enabled. This does not verify an interactive login, OAuth redirect allowlist or private-history operation.
- The isolated local Supabase suite previously passed 55 pgTAP assertions across four files. It was not rerun in this session; no Supabase CLI/configured local test stack was available.
- No public Cloudflare or API deployment was performed.

## CPU API deployment preparation

`backend/deploy/Dockerfile-api-only` builds FastAPI from the core `backend/pyproject.toml` dependencies only. It excludes PyTorch and model files. `backend/deploy/cloud-run-api-only.yaml` configures a low-resource CPU service with scale-to-zero; `backend/deploy/README-api-only.md` contains build, test, deploy and disable instructions. This service is intentionally API-only until a model adapter is approved and attached.

The existing public Cloudflare URL is still running its previously deployed build. Deploying these local changes requires Cloudflare account access. Deploying the API requires an authenticated Google Cloud project. Neither deployment has been executed.

## Tests

```powershell
python -m pytest backend/tests -q
cd frontend
npm test
npm run build
```

## Third-party attribution

The original Pixel2Mesh research implementation and any included research assets retain their original licenses and citations. No external pretrained reconstruction weights are represented as Pixel3Mesh-trained weights in this application.
