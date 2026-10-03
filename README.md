# 3D Object Reconstruction from Images

A single-image 3D reconstruction college project built around a completed Pixel2Mesh model. The web app currently takes an authenticated user from an image to a verified input; mesh generation is the next integration stage.

## Current application flow

`Email or Google sign-in → protected dashboard → New Reconstruction → image validation → authenticated FastAPI preflight → INPUT VERIFIED`

The workspace accepts one JPEG, PNG, or WebP image (up to 10 MB), shows its metadata and an interactive **input preview**, and checks the image again on the server. The preview is **not** reconstructed geometry. Pixel2Mesh inference, OBJ/GLB output, a result viewer, and history are still being built.

## Preview

| Landing | Authentication |
| --- | --- |
| ![Interactive landing page](assets/readme/landing.png) | ![Login page](assets/readme/login.png) |

| Dashboard | New Reconstruction |
| --- | --- |
| ![Protected dashboard](assets/readme/dashboard.png) | ![3D image input and preflight workspace](assets/readme/reconstruction.png) |

## What works

- Trained Pixel2Mesh model with Stage 3 as its final mesh output.
- React/Three.js landing page, Supabase email/password and Google OAuth, persistent sessions, and a protected dashboard.
- Premium 3D input workspace with click/drag-and-drop selection, replace/clear, preview, and frontend validation.
- FastAPI health API, verified Supabase JWT identity, and authenticated server-side image preflight.

## Stack and layout

| Area | Technology |
| --- | --- |
| Model | Python, PyTorch, Pixel2Mesh |
| Backend | FastAPI; Supabase JWT verification; Pillow image checks |
| Frontend | React, JavaScript/JSX, Vite, Tailwind CSS, Axios, three.js with React Three Fiber/Drei |
| Auth / planned history | Supabase Auth / PostgreSQL |
| Planned result files | Stage-3 OBJ and browser-friendly GLB |

`backend/` holds the API and tests; `frontend/` holds the web app; `Pixel2Mesh/` is the protected trained ML component; `dataset_tools/` contains research utilities; `docs/` contains project documentation.

## Run locally

From the repository root in PowerShell with Python 3.11+:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e "./backend[dev]"
$env:SUPABASE_URL = "<your Supabase project URL>"
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload
```

In another terminal, run `npm.cmd ci` and `npm.cmd run dev` from `frontend/`, then open `http://127.0.0.1:5173`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in ignored `frontend/.env.local` for authentication; use only a publishable key. See [frontend setup](frontend/README.md) for details.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Public API availability |
| `GET` | `/api/v1/me` | Identity from a verified Supabase access token |
| `POST` | `/api/v1/reconstructions/preflight` | Authenticated image validation and metadata; no inference or storage |

## Model baseline

Training is complete. The final checkpoint is local at `Pixel2Mesh/checkpoints/260000_000010.pt`, is Git-ignored, and must not be uploaded.

| Mesh stage | Vertices | Faces |
| --- | ---: | ---: |
| 1 | 156 | 308 |
| 2 | 618 | 1,232 |
| 3 (final) | 2,466 | 4,928 |

Test-set evaluation metrics: Chamfer Distance **0.037181**, F1 @ τ **0.000640**, and F1 @ 2τ **0.001722**. These are metrics, not accuracy percentages.

## Next

Connect authenticated preflight to Pixel2Mesh inference, extract the final Stage-3 mesh, add OBJ/GLB output and an interactive result viewer, then persist reconstruction history and deploy. Full local CPU end-to-end inference is not yet verified.
