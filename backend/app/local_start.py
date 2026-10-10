"""Start the local API with its ignored, public Supabase project URL."""

import argparse
import os
from pathlib import Path
from urllib.parse import urlsplit


LOCAL_ENV_FILE = Path(__file__).resolve().parents[1] / ".env.local"


def load_local_supabase_url(env_file: Path = LOCAL_ENV_FILE) -> str:
    """Load only SUPABASE_URL; never import credentials from the local env file."""
    if not env_file.is_file():
        raise FileNotFoundError("Create the ignored backend environment file before starting the local API.")

    url = None
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() == "SUPABASE_URL":
            url = value.strip().strip('"\'').rstrip("/")
            break

    try:
        parsed = urlsplit(url or "")
        parsed.port  # Reject malformed ports before the API starts.
    except ValueError as exc:
        raise ValueError("SUPABASE_URL must be a valid public HTTPS project origin.") from exc
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("SUPABASE_URL must be a public HTTPS project origin in the ignored backend environment file.")

    os.environ["SUPABASE_URL"] = url
    return url


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the local reconstruction API.")
    parser.add_argument("--check", action="store_true", help="Validate local config without starting the API.")
    args = parser.parse_args()
    load_local_supabase_url()
    if args.check:
        print("Local API configuration is ready.")
        return

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
