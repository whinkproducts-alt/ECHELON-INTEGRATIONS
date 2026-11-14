#!/bin/zsh
# Clean-room venv setup for Marcus Vale backend
set -x
cd /Users/victorcheckingin/Developer/marcus-vale/backend || exit 1

unset PYTHONPATH
unset VIRTUAL_ENV
unset CONDA_PREFIX
unset PYTHONHOME

rm -rf .venv-mv
/usr/bin/python3 -m venv .venv-mv || exit 2

./.venv-mv/bin/python -m pip install --upgrade pip wheel setuptools || exit 3
./.venv-mv/bin/python -m pip install -r requirements.txt || exit 4

./.venv-mv/bin/python - <<'PY'
import fastapi, pydantic, sqlalchemy, asyncpg, httpx
print("DEPS_OK fastapi=%s pydantic=%s sqlalchemy=%s" % (
    fastapi.__version__, pydantic.VERSION, sqlalchemy.__version__))
PY
echo "SETUP_EXIT=$?"