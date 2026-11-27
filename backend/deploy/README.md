# Pixel3Mesh deployment

## Google Cloud Run (primary release target)

The container uses the verified CPU model and downloads its checkpoint from a **private** Cloud Storage bucket with the Cloud Run service identity. The checkpoint is not copied into the Docker image, frontend, or Git. The entrypoint verifies the exact SHA-256 before starting FastAPI. Grant the runtime identity only `roles/storage.objectViewer` on the model bucket; Google recommends the narrow object-viewer role when access is read-only ([IAM guidance](https://cloud.google.com/storage/docs/access-control/using-iam-permissions)).

### Prerequisites and one-time setup

Choose a project and region near the Supabase project. Confirm billing and the current [Cloud Run pricing](https://cloud.google.com/run/pricing) first: request-based billing still charges for startup/shutdown and active request time, and free-tier amounts depend on region/billing aggregation ([billing behavior](https://cloud.google.com/run/docs/configuring/billing-settings)).

```powershell
$PROJECT_ID = "your-gcp-project-id"
$REGION = "us-central1"
$RUNTIME_ACCOUNT = "pixel3mesh-runtime@$PROJECT_ID.iam.gserviceaccount.com"
$MODEL_BUCKET = "$PROJECT_ID-pixel3mesh-model"
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com --project $PROJECT_ID
gcloud iam service-accounts create pixel3mesh-runtime --project $PROJECT_ID
gcloud storage buckets create "gs://$MODEL_BUCKET" --project $PROJECT_ID --location $REGION --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$MODEL_BUCKET" --member "serviceAccount:$RUNTIME_ACCOUNT" --role roles/storage.objectViewer
```

Upload only the already verified private bundle files. Do not make this bucket public:

```powershell
$BUNDLE = "C:\path\to\Pixel3Mesh_SixCategory_FINAL_20261126"
Get-FileHash "$BUNDLE\best_model.pt" -Algorithm SHA256
gcloud storage cp "$BUNDLE\best_model.pt" "gs://$MODEL_BUCKET/Pixel3Mesh_SixCategory_FINAL_20261126/best_model.pt"
gcloud storage cp "$BUNDLE\inference_config.json" "gs://$MODEL_BUCKET/Pixel3Mesh_SixCategory_FINAL_20261126/inference_config.json"
```

The displayed hash must be `ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500`. The container independently verifies it during each cold start. Configure `SUPABASE_URL` to the real project URL and `CORS_ORIGINS` to the exact Cloudflare origin; neither is a secret. Keep Supabase user access tokens in the browser session and never add a service-role key to Cloud Run or Vite.

### Build, deploy and verify

Docker Desktop is needed for a local image build. For Cloud Build instead, enable the APIs above and submit this Dockerfile-backed source build; Google documents source deployment and Dockerfile detection in its [Cloud Run source deployment guide](https://cloud.google.com/run/docs/deploying-source-code).

```powershell
gcloud artifacts repositories create pixel3mesh --project $PROJECT_ID --location $REGION --repository-format docker
gcloud builds submit --project $PROJECT_ID --region $REGION --tag "$REGION-docker.pkg.dev/$PROJECT_ID/pixel3mesh/pixel3mesh-api:release-20261126" .
```

Deploy the image:

```powershell
gcloud run deploy pixel3mesh-api --project $PROJECT_ID --region $REGION --image "$REGION-docker.pkg.dev/$PROJECT_ID/pixel3mesh/pixel3mesh-api:release-20261126" --service-account $RUNTIME_ACCOUNT --cpu 2 --memory 2Gi --concurrency 1 --min 0 --max 1 --timeout 180 --execution-environment gen2 --no-cpu-boost --set-env-vars "SUPABASE_URL=https://your-project.supabase.co,CORS_ORIGINS=https://3d-product-reconstructor.pages.dev,PIXEL3MESH_MODEL_BUCKET=$MODEL_BUCKET,PIXEL3MESH_CHECKPOINT_OBJECT=Pixel3Mesh_SixCategory_FINAL_20261126/best_model.pt,PIXEL3MESH_CONFIG_OBJECT=Pixel3Mesh_SixCategory_FINAL_20261126/inference_config.json,RECONSTRUCTION_ENGINE=six_category,PIXEL3MESH_DEVICE=cpu"
gcloud run services update pixel3mesh-api --project $PROJECT_ID --region $REGION --startup-probe "httpGet.path=/api/v1/readiness,httpGet.port=8080,periodSeconds=10,timeoutSeconds=5,failureThreshold=24" --liveness-probe "httpGet.path=/api/v1/health,httpGet.port=8080,periodSeconds=10,timeoutSeconds=3,failureThreshold=3"
gcloud run services add-iam-policy-binding pixel3mesh-api --project $PROJECT_ID --region $REGION --member allUsers --role roles/run.invoker
```

The public Cloud Run invoker only allows traffic to reach FastAPI. All inference and identity routes still require a valid Supabase ES256 user access token; `/api/v1/health` and `/api/v1/readiness` expose only service/model status. A deployment is not verified until the actual service URL passes both health endpoints and a real authenticated calibrated inference. Probe behavior follows the [Cloud Run health-check documentation](https://cloud.google.com/run/docs/configuring/healthchecks).

```powershell
$SERVICE_URL = (gcloud run services describe pixel3mesh-api --project $PROJECT_ID --region $REGION --format "value(status.url)").Trim()
Invoke-RestMethod "$SERVICE_URL/api/v1/health"
Invoke-RestMethod "$SERVICE_URL/api/v1/readiness"
gcloud run services describe pixel3mesh-api --project $PROJECT_ID --region $REGION --format yaml
```

After a verified backend deploy, set Cloudflare Pages `VITE_API_BASE_URL` to that real service URL and redeploy the frontend only after the production migration and browser auth tests pass. No live URL is asserted by this package.

### Status, temporary public shutdown, re-enable and rollback

```powershell
# STATUS: inspect URL, current revision, scale settings, and traffic.
gcloud run services describe pixel3mesh-api --project $PROJECT_ID --region $REGION --format yaml
gcloud run revisions list --service pixel3mesh-api --project $PROJECT_ID --region $REGION

# DISABLE public invocation: remove public IAM access and close external ingress.
# The existing app still checks Supabase JWTs. With min=0 it scales down after idle.
gcloud run services remove-iam-policy-binding pixel3mesh-api --project $PROJECT_ID --region $REGION --member allUsers --role roles/run.invoker
gcloud run services update pixel3mesh-api --project $PROJECT_ID --region $REGION --ingress internal

# ENABLE public invocation again for the Cloudflare frontend.
gcloud run services update pixel3mesh-api --project $PROJECT_ID --region $REGION --ingress all
gcloud run services add-iam-policy-binding pixel3mesh-api --project $PROJECT_ID --region $REGION --member allUsers --role roles/run.invoker

# ROLLBACK: redeploy the prior immutable Artifact Registry image tag, then verify health/readiness.
gcloud run deploy pixel3mesh-api --project $PROJECT_ID --region $REGION --image "$REGION-docker.pkg.dev/$PROJECT_ID/pixel3mesh/pixel3mesh-api:PREVIOUS_VERIFIED_TAG" --service-account $RUNTIME_ACCOUNT --cpu 2 --memory 2Gi --concurrency 1 --min 0 --max 1 --timeout 180
```

`min=0` is scale-to-zero, not an access shutdown. Removing public invocation plus internal ingress closes the external endpoint. It does not remove ongoing costs for the private model bucket, Artifact Registry images, logs, or network egress. Review these resources in billing before leaving the project idle.

### Container and resource notes

- `Dockerfile` installs the pinned CPU-only model dependencies, runs one Uvicorn worker under a non-root UID, and copies backend code only.
- The checkpoint is downloaded to `/tmp` at startup using the Cloud Run service identity and its SHA is checked before the API starts.
- One request per container, at most one instance, request-based CPU, 2 vCPU, 2 GiB memory, zero minimum instances and 180-second timeout are the initial limits. The local Windows model process previously measured ~456.5 MiB RSS and ~10.6 s model initialization; this is not a Cloud Run cold-start measurement. The Cloud Run startup probe permits up to 240 seconds for model readiness.
- The current endpoint requires a matching calibrated 224×224 RGB image and camera JSON. Arbitrary-photo camera estimation is not implemented.

**Cloud Run is not deployed yet.** No project/account was configured when this package was prepared. The exact manual setup is above.

## Optional Modal deployment

This is a deployment configuration only. It does not deploy automatically, create a Modal account, upload model weights, or authorize billing.

## Runtime contract

- Backend: existing FastAPI app in `backend/app`.
- Engine: verified six-category Pixel3Mesh adapter.
- Input: authenticated PNG/JPEG/WebP, 224×224 RGB, plus matching camera JSON.
- Output: 2,048 predicted XYZ points and an open visible-surface OBJ. The hidden surface is not inferred as a complete watertight mesh.
- Checkpoint SHA-256: `ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500`.
- Weights live in a private Modal Volume, not in the image or Git. The backend verifies the checkpoint hash before model load.
- CPU is the default. Optional GPU uses the same adapter by setting `PIXEL3MESH_MODAL_GPU=T4` before `modal deploy backend/deploy/modal_app.py`.

## CPU deployment steps

Run from the repository root. First install the deployment CLI and authenticate interactively:

```powershell
python -m pip install -r backend/deploy/requirements-modal-cli.txt
modal setup
```

Create a Modal Secret named `pixel3mesh-api` in the Modal dashboard with:

- `SUPABASE_URL`: the project URL used by Supabase Auth JWT verification.
- `CORS_ORIGINS`: `https://3d-product-reconstructor.pages.dev` (or your exact approved frontend origin).

Create the Modal Volume `pixel3mesh-model-artifacts` in the same Modal environment. The app declares it with `create_if_missing=True`; keep it private.

Upload only the selected bundle's `best_model.pt` and `inference_config.json` after verifying the source bundle is available locally:

```powershell
modal run backend/deploy/modal_app.py::upload_verified_model_bundle --bundle-directory "C:\path\to\Pixel3Mesh_SixCategory_FINAL_20261126"
```

The local entrypoint verifies the checkpoint SHA before uploading the two required files. Then deploy:

```powershell
modal deploy backend/deploy/modal_app.py
```

The deploy command prints the actual HTTPS URL. Verify `/api/v1/health` first, then `/api/v1/readiness`. Readiness is expected to stay false until the Modal Volume has both files and model initialization succeeds. Do not copy a URL from this document as though it were deployed.

## GPU option

GPU is optional and not deployed by default. After confirming account budget and credits, set:

```powershell
$env:PIXEL3MESH_MODAL_GPU = "T4"
modal deploy backend/deploy/modal_app.py
```

This selects the matching pinned CUDA PyTorch wheel and sets `PIXEL3MESH_DEVICE=cuda`; it does not change the model or checkpoint. Unset the variable and redeploy to return to CPU. Modal bills usage; its free Starter plan includes monthly compute credits, not unlimited or permanently free inference. Review the current [Modal pricing](https://modal.com/pricing) before deploying.

## Resources and limits

The initial CPU configuration requests 2 physical CPU cores, requests 2 GiB RAM with a 4 GiB hard ceiling, allows one model request per container, caps the deployment to one container, and scales to zero after idle use. A measured local Windows CPU process tree peaked at about 456.5 MiB resident memory. That is a local measurement, not a Modal container measurement; Modal cold-start and peak-memory values remain unmeasured until account-authorized staging deployment. In the tested local environment, first model initialization took 10.6 seconds, first end-to-end prediction 21.9 seconds including process/import startup, subsequent total request 0.73 seconds, and model execution 0.31 seconds.

## Shutdown and rollback

Use the Modal dashboard or `modal app stop pixel3mesh-inference` to stop the deployed app. Roll back by deploying the previously verified app code and keeping the same SHA-verified bundle in the private volume. Do not delete the volume during rollback. For account-specific deployment revisions and logs, use the Modal dashboard.

## Local checks before deployment

```powershell
python -m pytest backend/tests
cd frontend
npm test
npm run build
```

The Modal deployment is not complete until an authorized deployment returns real HTTP health/readiness responses and an authenticated calibrated inference request succeeds.
