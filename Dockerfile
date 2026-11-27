FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    RECONSTRUCTION_ENGINE=six_category \
    PIXEL3MESH_DEVICE=cpu \
    PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/deploy/requirements-cpu.txt /app/backend/deploy/requirements-cpu.txt
COPY backend/deploy/requirements-cloud-run.txt /app/backend/deploy/requirements-cloud-run.txt
RUN pip install --no-cache-dir --index-url https://pypi.org/simple \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      -r /app/backend/deploy/requirements-cloud-run.txt

COPY backend/app /app/backend/app
COPY backend/deploy/cloud_run_entrypoint.py /app/backend/deploy/cloud_run_entrypoint.py

USER 10001:10001
EXPOSE 8080
CMD ["python", "/app/backend/deploy/cloud_run_entrypoint.py"]
