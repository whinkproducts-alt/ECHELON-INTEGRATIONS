#!/bin/zsh
# Marcus Vale backend launcher — hard-clears the inherited Hermes Python env
# so the venv interpreter is not polluted by PYTHONPATH (Hermes py3.14 site-packages).
set -e
cd "$(dirname "$0")" || exit 1

unset PYTHONPATH
unset PYTHONHOME
unset VIRTUAL_ENV
unset CONDA_PREFIX
export PYTHONNOUSERSITE=1

PORT="${1:-8001}"

exec ./.venv-mv/bin/python -m uvicorn main:app \
  --host 127.0.0.1 \
  --port "$PORT" \
  --log-level info