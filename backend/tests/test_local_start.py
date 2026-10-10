"""The local API launcher reads only its ignored public project URL."""

import os

import pytest

from app.local_start import load_local_supabase_url


def test_local_start_loads_valid_url_without_printing_it(tmp_path, monkeypatch, capsys):
    env_file = tmp_path / ".env.local"
    env_file.write_text('SUPABASE_URL="https://example.supabase.co/"\nOTHER_SECRET=do-not-load\n')
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("OTHER_SECRET", raising=False)

    assert load_local_supabase_url(env_file) == "https://example.supabase.co"
    assert os.environ["SUPABASE_URL"] == "https://example.supabase.co"
    assert "OTHER_SECRET" not in os.environ
    assert "example.supabase.co" not in capsys.readouterr().out


@pytest.mark.parametrize("contents", [
    "", "OTHER=value\n", "SUPABASE_URL=http://example.supabase.co\n",
    "SUPABASE_URL=https://example.supabase.co/unsafe/path\n",
    "SUPABASE_URL=https://user:pass@example.supabase.co\n",
    "SUPABASE_URL=https://example.supabase.co:bad\n",
    "SUPABASE_URL=not-a-url\n",
])
def test_local_start_rejects_missing_or_invalid_public_url(tmp_path, monkeypatch, contents):
    env_file = tmp_path / ".env.local"
    env_file.write_text(contents)
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    with pytest.raises(ValueError, match="SUPABASE_URL"):
        load_local_supabase_url(env_file)
    assert "SUPABASE_URL" not in os.environ


def test_local_start_rejects_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="ignored backend environment"):
        load_local_supabase_url(tmp_path / ".env.local")
