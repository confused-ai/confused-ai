"""
Starts the Agno benchmark server.
Usage:  python3 examples/run_agno_server.py
Reads OPENAI_API_KEY / OPENAI_MODEL from examples/.env automatically.
"""
import os
import pathlib
import re
import subprocess
import sys

# ── Load examples/.env ───────────────────────────────────────────────────────
env_file = pathlib.Path(__file__).parent / ".env"
env = os.environ.copy()
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
        if m:
            env[m.group(1)] = m.group(2).strip()

model = env.get("OPENAI_MODEL", "gpt-4o-mini")
print(f"Starting Agno server — model: {model}  port: 8000")

subprocess.run(
    [
        sys.executable, "-m", "uvicorn",
        "examples.agno_server:app",
        "--port", "8000",
        "--log-level", "info",
    ],
    env=env,
    cwd=pathlib.Path(__file__).parent.parent,
)
