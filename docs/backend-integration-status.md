# Pixel3Mesh live inference and deployment status

## Verified model contract

The selected local artifact is the six-category Pixel3Mesh research baseline from the private Drive bundle `Pixel3Mesh_SixCategory_FINAL_20261126`. `best_model.pt` is 55,811,595 bytes and has SHA-256 `ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500`. The checkpoint is kept under ignored `.review/frozen_bundle/`; no weights are committed.

The adapter loads the verified ResNet18 encoder, global point decoder and depth/foreground branch with strict state-dict compatibility, `torch.load(weights_only=True)`, model evaluation mode and inference-only execution. Inference accepts a 224×224 RGB image plus its matching `pose`, rigid 4×4 `camera_to_world`, and intrinsics. It does not read GT, EXR or source geometry. It returns 2,048 predicted points and an open camera-visible depth surface, not a complete watertight object. Arbitrary uncalibrated photographs and unseen-object accuracy are not verified.

## Executed model and API evidence

- Colab T4: a real Speaker example returned 2,048 points, 5,517 visible vertices and 10,693 triangles. The earlier recorded model initialization was 1,264.6 ms and an authenticated-dependency-overridden TestClient inference request returned HTTP 200 in 1.46 seconds. The test override verifies route-to-model execution; it does not verify a real Supabase JWT session.
- Local Windows CPU, using the same checkpoint: two real predictions passed geometry validation. Process-tree peak resident memory was 456.5 MiB. First model initialization was 10.6 seconds; first request including import/process start was 21.9 seconds; warm request was 0.73 seconds end-to-end / 0.31 seconds in the model call. Output counts were 5,517 vertices and 10,693 faces. These are local measurements, not Modal measurements.
- Backend tests: 65 passed. Frontend tests: 97 passed. Production Vite build: passed with the existing large-chunk warning.
- The six-category gallery's 18 existing RGB/PLY/OBJ examples remain separate from new live inference.

## Private reconstruction history

The historical `public.reconstructions` table still has its original fixed-topology 2,466-vertex/4,928-face constraint and is unchanged. New live outputs use the additive `public.model_reconstruction_outputs` schema in `supabase/migrations/20261126170000_variable_geometry_model_outputs.sql`. It records owner, source/camera metadata, model/checkpoint identity, variable geometry counts and private object keys. Storage objects are in the existing private `reconstruction-artifacts` bucket under `owner/reconstruction/model-v1/`; database rows contain keys, not signed URLs. Authenticated reads mint 120-second signed URLs. New RLS policies are owner-scoped and additive; the old rows and policies are retained.

The frontend persistence helpers validate genuine model output, upload the input image, PLY and visible OBJ, then insert the metadata row. They clean up uploaded files if row insertion fails. Reload downloads only owner-authorized assets and validates PLY/OBJ counts before returning geometry. Frontend tests exercise upload, re-open parsing, owner filtering and failure cleanup with a mocked Supabase client. The pgTAP migration test checks schema, policy definitions, variable geometry insertion and row-level owner separation.

Local Supabase migration execution is **not verified**: the Supabase CLI is absent, Docker Desktop service is stopped, and starting the service failed because this session cannot open the service. The migration has not been applied to hosted Supabase. See `supabase/tests/model_reconstruction_outputs_rls.test.sql` and the commands in `backend/deploy/README.md` for the local database gate before hosted application.

## Run locally

1. Install backend dependencies in an isolated Python environment: `python -m pip install -e "./backend[model,dev]"`.
2. Copy `backend/.env.example` to a private `backend/.env.local`; set `SUPABASE_URL`, `CORS_ORIGINS`, `PIXEL3MESH_CHECKPOINT`, `PIXEL3MESH_CONFIG`, and `PIXEL3MESH_DEVICE=cpu`. Use the checkpoint in the private bundle; never commit it.
3. Start the API: `uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`.
4. Set `VITE_API_BASE_URL=http://127.0.0.1:8000` in the private frontend environment and start Vite.
5. Apply the new Supabase migration to a local Supabase test stack, run `supabase test db`, then run the browser workflow with a legitimate test account. No production migration is applied by this integration.

The browser check in this session redirected `/reconstruct` to the real `/login` gate with zero console errors. A signed-in browser session was not available, so authenticated upload, private history save/reopen, and real private storage download remain unverified in browser. The user action required is to sign in normally with the configured Supabase account in the local browser; no password or code should be sent to the development session.

## Modal deployment preparation

`backend/deploy/modal_app.py` was import-checked against the pinned Modal Python SDK 1.6.4 for both CPU and T4 configurations. It uses Modal's supported FastAPI ASGI web function, private Volume for the checkpoint and inference config, a named Secret for `SUPABASE_URL`, explicit frontend CORS, one serialized request per container, max one container, zero minimum containers, 60-second scale-down and health/readiness routes. CPU is the default; optional GPU uses the same adapter and verified CUDA wheel set. `backend/deploy/README.md` gives setup, upload, deploy, verification and stop/rollback commands. No Modal credentials, volume, deployment or billing authorization were available; there is no deployed URL. Modal cold-start and cloud memory are not measured.

## API endpoints

- `GET /api/v1/health`: process liveness only.
- `GET /api/v1/readiness`: checkpoint hash plus actual model initialization; returns unavailable when the model is not ready.
- `GET /api/v1/me`: authenticated Supabase identity.
- `POST /api/v1/reconstructions/preflight`: authenticated image validation.
- `POST /api/v1/reconstructions/infer`: authenticated calibrated inference, preserving the existing route.

## Deployment limits

The public Cloudflare Pages site remains unchanged. Do not configure the live upload page against a backend URL until a real service is deployed and authenticated inference passes. Use CPU first: the tested local process used under 0.5 GiB peak resident memory and returned warm predictions under one second in that machine. Modal CPU requests 2 physical cores, requests 2 GiB memory with a 4 GiB hard limit, serializes requests, caps at one container, and scales to zero. This is a conservative configuration, not a cloud resource measurement. Review live Modal pricing and usage credits before deployment; no service has been activated.
