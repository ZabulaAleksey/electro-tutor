FROM ghcr.io/astral-sh/uv:0.12.3 AS uv
FROM python:3.12.5-slim-bookworm

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_NO_DEV=1 \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN uv sync --locked --no-dev
RUN groupadd --system --gid 10001 electro \
    && useradd --system --uid 10001 --gid electro --home /nonexistent electro \
    && mkdir -p /tmp/uv-cache \
    && chown -R electro:electro /app /tmp/uv-cache
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "electro_tutor_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
