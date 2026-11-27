# API-only CPU service

This package runs FastAPI without installing PyTorch, downloading a checkpoint, or starting an inference worker. Health, image preflight, Supabase JWT verification, and the frontend's direct Supabase history/storage calls remain available. Model readiness is expected to return HTTP 503 and reconstruction requests return HTTP 503 until a compatible engine is attached. No placeholder geometry is generated.

## Build and test locally

Run from the repository root:

```powershell
docker build -f backend/deploy/Dockerfile-api-only -t pixel3mesh-api-only:local .
docker run --rm --name pixel3mesh-api-only -p 8080:8080 `
  -e SUPABASE_URL=https://PROJECT_REF.supabase.co `
  -e CORS_ORIGINS=https://3d-product-reconstructor.pages.dev `
  pixel3mesh-api-only:local
```

In another terminal, `GET /api/v1/health` should return 200. `GET /api/v1/readiness` should return 503 while the engine is disabled. An authenticated valid image request is expected to return 503. These statuses distinguish API liveness from model availability.

The image has the project's pinned runtime dependencies from `backend/pyproject.toml` only. PyTorch and torchvision are optional model dependencies and are not installed in this image. Run a local RSS check with `docker stats pixel3mesh-api-only` after startup before choosing the Cloud Run memory allocation.

## Cloud Run

The service configuration is `backend/deploy/cloud-run-api-only.yaml`. Replace the project, region, project reference, and image placeholders. It is configured for one CPU, 512 MiB, request-based CPU, 8 concurrent requests, one maximum instance and zero minimum instances. The startup probe checks API health rather than model readiness so an intentionally offline inference engine does not prevent the API from starting.

Build and publish the image after authenticating to the intended Google Cloud project and creating the Artifact Registry repository:

```powershell
$PROJECT_ID = "your-project-id"
$REGION = "us-central1"
$IMAGE = "$REGION-docker.pkg.dev/$PROJECT_ID/pixel3mesh/pixel3mesh-api:api-only"
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com --project $PROJECT_ID
gcloud artifacts repositories create pixel3mesh --project $PROJECT_ID --location $REGION --repository-format docker
docker build -f backend/deploy/Dockerfile-api-only -t $IMAGE .
docker push $IMAGE
```

Edit the manifest placeholders, then deploy:

```powershell
gcloud run services replace backend/deploy/cloud-run-api-only.yaml --project $PROJECT_ID --region $REGION
gcloud run services add-iam-policy-binding pixel3mesh-api --project $PROJECT_ID --region $REGION --member allUsers --role roles/run.invoker
$SERVICE_URL = gcloud run services describe pixel3mesh-api --project $PROJECT_ID --region $REGION --format="value(status.url)"
curl.exe -i "$SERVICE_URL/api/v1/health"
curl.exe -i "$SERVICE_URL/api/v1/readiness"
```

Only make the Cloud Run service publicly invokable if the project owner approves that exposure. Protected endpoints still verify Supabase access tokens; do not add service-role credentials to this service. `SUPABASE_URL` is the public project URL, not a secret.

To stop public invocation for a demonstration pause, remove the `allUsers` invoker binding and verify the IAM policy. To re-enable it, add the binding again. Scale-to-zero does not delete Artifact Registry images, logs, or other billable project resources. No hosted migration or Cloud Run deployment has been applied by this package.
