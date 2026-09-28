"""Bounded outbox delivery and retention maintenance.

Run as a separate process with the API's runtime database credentials. The
database owns deduplication and row-level processing; this process never reads
private payloads.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from argparse import ArgumentParser

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from electro_tutor_api.adapters.database import DatabaseHealth, create_runtime_engine
from electro_tutor_api.config import get_settings
from electro_tutor_api.schema_catalog_contract import verify_catalog

LOG = logging.getLogger("electro_tutor_api.notification_worker")
POLL_SECONDS = 15
BATCH_SIZE = 100
CLEANUP_BATCH_SIZE = 500


async def run_once(engine: AsyncEngine) -> tuple[int, int]:
    async with engine.begin() as connection:
        delivered = await connection.scalar(
            text("SELECT public.deliver_notification_outbox(:limit)"), {"limit": BATCH_SIZE}
        )
    # Expiry failure cannot roll back a committed delivery batch.
    async with engine.begin() as connection:
        removed = await connection.scalar(
            text("SELECT public.cleanup_expired_notifications(:limit)"),
            {"limit": CLEANUP_BATCH_SIZE},
        )
    return int(delivered), int(removed)


async def run(*, once: bool = False) -> None:
    settings = get_settings()
    engine = create_runtime_engine(settings)
    try:
        await DatabaseHealth(engine).check()
        async with engine.connect() as connection:
            await verify_catalog(connection)
        failures = 0
        while True:
            try:
                delivered, removed = await run_once(engine)
                failures = 0
                if delivered or removed:
                    LOG.info("notification maintenance delivered=%d removed=%d", delivered, removed)
            except Exception as exc:
                failures += 1
                LOG.error("notification maintenance failed: %s", type(exc).__name__)
                if once:
                    raise
            if once:
                return
            await asyncio.sleep(min(POLL_SECONDS * (2 ** min(failures, 2)), 60))
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(description="Electro Tutor notification maintenance worker")
    parser.add_argument("--once", action="store_true", help="run one bounded batch and exit")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        asyncio.run(run(once=args.once))
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        print(f"notification worker unavailable: {type(exc).__name__}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
