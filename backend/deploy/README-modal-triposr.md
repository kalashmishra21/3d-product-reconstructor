# TripoSR on Modal

This deployment serves the existing FastAPI application and authenticated TripoSR route on one T4-backed Modal ASGI function. The function scales from zero, permits one container and one in-flight input, and keeps the model artifacts in a private Modal Volume. Deploying or invoking the function uses billable resources; this repository change does neither.

## Verified artifacts and runtime

- TripoSR source: `VAST-AI-Research/TripoSR`, revision `107cefdc244c39106fa830359024f6a2f1c78871`.
- Official model revision: `5b521936b01fbe1890f6f9baed0254ab6351c04a`.
- Checkpoint SHA-256: `429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee` (1,677,246,742 bytes).
- Verified environment: Python 3.10, torch 2.1.2+cu121, torchvision 0.16.2+cu121, Transformers 4.35.0, NumPy 1.26.4, scikit-image 0.24.0. The Modal image pins compatible package versions; Modal's T4 image supplies the CUDA host driver. `torchmcubes` is not compiled; the included shim runs only marching-cubes extraction on CPU.
- Foreground removal uses `rembg` U2NETP through CPU ONNX Runtime. The worker uses the same preprocessing implementation as the verified bundle.

## Configure and deploy

Install the CLI with `python -m pip install -r backend/deploy/requirements-modal-cli.txt`, then authenticate with `python -m modal setup`. Create a Modal Secret named `pixel3mesh-triposr-api` containing `SUPABASE_URL` and set `CORS_ORIGINS` to the exact Cloudflare Pages origin. The Supabase URL is public configuration; never place service-role credentials in this secret or the frontend. The FastAPI routes verify user JWTs using Supabase JWKS.

Confirm the workspace spend limit in Modal Usage & Billing before deploying. T4 use requires a payment method. Do not add one or deploy without owner approval. Modal's Starter credits are not a guarantee against charges; compute over the remaining credits can be billed. The GPU price and workspace spend controls can change; consult Modal's current pricing and budgets pages immediately before deployment.

```powershell
python -m modal deploy backend/deploy/modal_app.py
```

The first request downloads official weights from the pinned Hugging Face revision into the private Volume and verifies checkpoint/config hashes. The Volume survives function scale-down and app stop. The service accepts only authenticated existing API requests; there is no unauthenticated inference endpoint. Uploads retain the API's 10 MiB and 25-megapixel limits. A single T4 container handles at most one input at once; scale-to-zero uses a 60-second idle window.

Set Cloudflare Pages production variable `VITE_API_BASE_URL` to the HTTPS URL printed for the Modal ASGI app. Do not put Modal API tokens in Cloudflare or `VITE_*` variables. Update the Supabase Auth Site URL/redirect allowlist only if the site origin changes; the current Pages origin remains unchanged. The app's CORS allowlist is `CORS_ORIGINS` in the Modal Secret/environment.

## Operations

```powershell
python -m modal app list --env main
python -m modal app stop pixel3mesh-triposr --env main
python -m modal deploy backend/deploy/modal_app.py
```

Stopping the app disables its endpoint; scale-to-zero only idles containers while the deployed endpoint remains available. To roll back, redeploy the previous reviewed commit; keep the named model Volume. Update weights only by changing the pinned model revision and expected SHA together, then review and deploy a new commit. Never delete the Volume as a stop procedure.

## Supabase migration

Before serving authenticated history, inspect hosted migration history and apply the additive migration `supabase/migrations/20261127180000_triposr_reconstruction_outputs.sql` through the authorized Supabase project workflow. It must be reviewed and tested against the target project first; this Modal setup does not apply hosted migrations. Keep private storage policies enabled and verify user isolation after migration.

## Verification boundary

Local tests and static Modal image/config checks do not prove cloud deployment. A release still requires an authorized T4 deployment, HTTPS health/readiness, authenticated new-image inference, private history/download verification, and public Cloudflare integration. No cloud URL or runtime measurement is asserted by this document.
