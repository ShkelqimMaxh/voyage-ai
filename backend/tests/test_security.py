from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_env_is_gitignored():
    ignore = (ROOT / ".gitignore").read_text()
    assert ".env" in ignore


def test_env_file_not_tracked_if_present():
    env_path = ROOT / ".env"
    if env_path.is_file():
        listed = Path(ROOT / ".gitignore").read_text()
        assert any(line.strip() == ".env" for line in listed.splitlines())


def test_example_env_has_no_live_key():
    example = (ROOT / ".env.example").read_text()
    assert "AIza" not in example
    assert "sk-ant-" not in example
    assert "GEMINI_API_KEY=" in example
