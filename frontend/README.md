# Frontend development

## Local development

From `frontend/`, using Node.js 22.18+ (tested environment: Node 24):

```powershell
npm.cmd ci
npm.cmd run dev
```

In another terminal, from the repository root:

```powershell
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the existing FastAPI service
at `http://127.0.0.1:8000`, so local development needs no backend CORS change.

The health indicator checks the real API through Axios. It does not establish
model readiness.

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Preview runs on port 4173 with the same local API proxy. A future production host
must provide a same-origin `/api` proxy and SPA fallback.

## Authentication setup

Create `.env.local` and fill in `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` with the project's URL and **publishable** key (or
legacy anon key). Never use a service-role/secret key in Vite. Restart Vite after
changing env values. With no values, the auth pages show a setup message.

In Supabase Auth, set the Site URL to `http://127.0.0.1:5173` and allow
`http://127.0.0.1:5173/**` as a development redirect URL. Enable Email and
Google providers. In Google Cloud, point the OAuth client's authorized redirect
URI to the Supabase callback URL shown in its Google provider settings. Password
reset and email confirmation links return through `/auth/callback`.
