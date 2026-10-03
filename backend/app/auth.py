"""Verify Supabase Auth access tokens using the project's public signing keys."""

import os
from functools import lru_cache
from urllib.error import URLError
from urllib.parse import urlparse

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError


AUDIENCE = "authenticated"
ALGORITHMS = ["ES256"]
UNAUTHORIZED = {"WWW-Authenticate": "Bearer"}


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=401, detail="Invalid or missing access token", headers=UNAUTHORIZED)


def _issuer() -> str:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path or parsed.query or parsed.fragment:
        raise HTTPException(status_code=503, detail="Supabase authentication is not configured")
    return f"{url}/auth/v1"


@lru_cache(maxsize=4)
def _jwks_client(issuer: str) -> PyJWKClient:
    # Cache the JWKS for five minutes; PyJWKClient refreshes on an unknown kid.
    return PyJWKClient(f"{issuer}/.well-known/jwks.json", lifespan=300, timeout=5)


def verified_user(authorization: str | None = Header(default=None)) -> dict[str, str]:
    """Return only identity claims from a signed, unexpired user access token."""
    parts = authorization.split() if authorization else []
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise _unauthorized()

    token = parts[1]
    issuer = _issuer()
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "ES256" or not header.get("kid"):
            raise _unauthorized()
        key = _jwks_client(issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            issuer=issuer,
            options={"require": ["iss", "aud", "exp", "iat", "sub", "role", "email"]},
        )
    except (PyJWKClientConnectionError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=503, detail="Authentication keys are temporarily unavailable") from exc
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise _unauthorized() from exc

    if (
        claims.get("role") != "authenticated"
        or claims.get("is_anonymous") is True
        or not isinstance(claims.get("sub"), str)
        or not claims["sub"]
        or not isinstance(claims.get("email"), str)
        or not claims["email"]
    ):
        raise _unauthorized()
    return {"id": claims["sub"], "email": claims["email"], "role": claims["role"]}
