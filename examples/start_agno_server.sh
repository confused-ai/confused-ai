#!/usr/bin/env bash
# Starts the Agno benchmark server, loading env from examples/.env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Load env vars (skip blank lines and comments)
if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        # strip spaces around =
        key="${line%%=*}"
        val="${line#*=}"
        key="${key// /}"
        val="${val# }"
        export "$key=$val"
    done < "$ENV_FILE"
fi

echo "Starting Agno server with model: ${OPENAI_MODEL:-gpt-4o-mini}"
exec fastapi dev "$SCRIPT_DIR/agno_server.py" --port 8000
