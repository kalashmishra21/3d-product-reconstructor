"""JWT tests use an ephemeral signing key and never contact Supabase."""

import base64
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from jwt.exceptions import PyJWKClientConnectionError

from app import auth
from app.main import app


ISSUER = "https://example.supabase.co/auth/v1"
SUBJECT = "123e4567-e89b-12d3-a456-426614174000"


def _b64url(number: int) -> str:
    return base64.urlsafe_b64encode(number.to_bytes(32, "big")).rstrip(b"=").decode("ascii")


@pytest.fixture
def signing_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    private_key = ec.generate_private_key(ec.SECP256R1())
    public = private_key.public_key().public_numbers()
    jwks = {"keys": [{"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "test-key", "x": _b64url(public.x), "y": _b64url(public.y)}]}
    monkeypatch.setattr(auth.PyJWKClient, "fetch_data", lambda self: jwks)
    auth._jwks_client.cache_clear()
    yield private_key
    auth._jwks_client.cache_clear()


def _token(key, **overrides):
    now = datetime.now(timezone.utc)
    claims = {
        "iss": ISSUER,
        "aud": "authenticated",
        "sub": SUBJECT,
        "email": "user@example.com",
        "role": "authenticated",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test-key"})


def _me(token):
    return TestClient(app).get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})


def test_health_remains_public():
    assert TestClient(app).get("/api/v1/health").status_code == 200


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer", "Bearer a b"])
def test_missing_or_bad_authorization_header_is_rejected(header):
    headers = {"Authorization": header} if header else {}
    assert TestClient(app).get("/api/v1/me", headers=headers).status_code == 401


def test_malformed_token_is_rejected(signing_key):
    assert _me("not-a-jwt").status_code == 401


def test_valid_verified_claims_are_returned(signing_key):
    response = _me(_token(signing_key))
    assert response.status_code == 200
    assert response.json() == {"id": SUBJECT, "email": "user@example.com", "role": "authenticated"}


def test_invalid_signature_is_rejected(signing_key):
    other_key = ec.generate_private_key(ec.SECP256R1())
    assert _me(_token(other_key)).status_code == 401


@pytest.mark.parametrize("changes", [
    {"iss": "https://other.supabase.co/auth/v1"},
    {"aud": "anon"},
    {"role": "service_role"},
    {"email": ""},
    {"exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
])
def test_invalid_claims_are_rejected(signing_key, changes):
    assert _me(_token(signing_key, **changes)).status_code == 401


def test_jwks_is_cached(signing_key, monkeypatch):
    calls = []
    jwks = auth._jwks_client(ISSUER).get_jwk_set().keys
    auth._jwks_client.cache_clear()

    def fetch(self):
        calls.append(1)
        return {"keys": [key._jwk_data for key in jwks]}

    monkeypatch.setattr(auth.PyJWKClient, "fetch_data", fetch)
    token = _token(signing_key)
    assert _me(token).status_code == 200
    assert _me(token).status_code == 200
    assert len(calls) == 1


def test_jwks_outage_is_not_misreported_as_invalid_token(signing_key, monkeypatch):
    auth._jwks_client.cache_clear()

    def fail_fetch(self):
        raise PyJWKClientConnectionError("Public signing keys unavailable")

    monkeypatch.setattr(auth.PyJWKClient, "fetch_data", fail_fetch)
    assert _me(_token(signing_key)).status_code == 503
