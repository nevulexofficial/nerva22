"""Deployment entrypoint for the ``data_process`` service.

The scripts in this directory (``pipeline.py``, ``fetch_api_football.py``, …)
are offline ETL tools meant to be run manually — they are not an HTTP API.
Vercel requires every Python service to expose an ASGI application, so this
module provides a small FastAPI app with health/introspection endpoints only.

No pipeline stage is triggered over HTTP on purpose: the pipeline needs the
``API_FOOTBALL_KEY`` secret and can run for minutes, which does not belong in
a request handler.
"""

from fastapi import FastAPI

app = FastAPI(
    title="TouchLines data_process",
    description="Deployment entrypoint for the offline data pipeline scripts.",
    version="1.0.0",
)


@app.get("/")
def root() -> dict:
    return {
        "service": "data_process",
        "status": "ok",
        "note": "Offline ETL pipeline. Scripts are run manually, not via HTTP.",
    }


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}
