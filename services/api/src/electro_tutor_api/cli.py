from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any
from uuid import UUID

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from electro_tutor_api.adapters.database import ALEMBIC_DIR, expected_revision
from electro_tutor_api.config import MigrationSettings, ProvisioningSettings, Settings
from electro_tutor_api.domain.audit import AuditAction
from electro_tutor_api.e2e_support import E2ESupport, E2ESupportError
from electro_tutor_api.schema_catalog_contract import (
    CatalogDriftError,
    catalog_differences,
    load_manifest,
    snapshot_catalog,
    snapshot_manifest,
    verify_catalog,
)


def alembic_config(settings: MigrationSettings) -> Config:
    config = Config(str(ALEMBIC_DIR.parent / "alembic.ini"))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    config.set_main_option("sqlalchemy.url", settings.migration_database_url.replace("%", "%%"))
    return config


async def db_status(settings: MigrationSettings) -> dict[str, str | None]:
    engine = create_async_engine(settings.migration_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT version_num FROM alembic_version"))
            current = result.scalar_one_or_none()
    finally:
        await engine.dispose()
    return {"current": str(current) if current else None, "expected": expected_revision()}


async def db_catalog_check(settings: MigrationSettings) -> None:
    engine = create_async_engine(settings.migration_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            await verify_catalog(connection)
    finally:
        await engine.dispose()


async def db_catalog_snapshot(settings: MigrationSettings) -> dict[str, object]:
    engine = create_async_engine(settings.migration_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            if current != expected_revision():
                raise CatalogDriftError("baseline migration head is not current")
            return snapshot_manifest(await snapshot_catalog(connection))
    finally:
        await engine.dispose()


async def db_catalog_diagnose(settings: MigrationSettings) -> dict[str, object]:
    engine = create_async_engine(settings.migration_database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
            if current != expected_revision():
                raise CatalogDriftError("database revision does not match catalog manifest")
            differences = catalog_differences(await snapshot_catalog(connection), load_manifest())
            return {"status": "drift" if differences else "ok", "differences": differences}
    finally:
        await engine.dispose()


def _emit(payload: dict[str, object], *, error: bool = False) -> None:
    print(
        json.dumps(payload, sort_keys=True, separators=(",", ":")),
        file=sys.stderr if error else sys.stdout,
    )


def _required(value: str | None) -> str:
    if value is None:
        raise E2ESupportError("invalid_request")
    return value


def _uuid(value: str | None) -> UUID:
    try:
        return UUID(_required(value))
    except ValueError as exc:
        raise E2ESupportError("invalid_identifier") from exc


async def _run_e2e_support(
    command_name: str,
    args: argparse.Namespace,
    settings: Settings,
    provisioning_settings: ProvisioningSettings,
) -> dict[str, object]:
    support = E2ESupport(settings, provisioning_settings)
    try:
        subject = _required(args.subject)
        if command_name == "e2e-resolve-account":
            account_id = await support.resolve_account(subject)
            return {
                "account_id": str(account_id),
                "operation": "account_resolved",
                "status": "ok",
            }
        if command_name in {"e2e-issue-tutor-grant", "e2e-issue-booking-grant"}:
            operation_id = _uuid(args.operation_id)
            correlation_id = _uuid(args.correlation_id)
            request_id = _required(args.request_id)
            issue = (
                support.issue_tutor_grant
                if command_name == "e2e-issue-tutor-grant"
                else support.issue_booking_grant
            )
            account_id, grant = await issue(
                subject=subject,
                managed_subjects=args.managed_subject,
                operation_id=operation_id,
                correlation_id=correlation_id,
                request_id=request_id,
            )
            return {
                "account_id": str(account_id),
                "capability_code": grant.capability_code.value,
                "correlation_id": str(correlation_id),
                "grant_id": str(grant.id),
                "operation": (
                    "tutor_grant_issued"
                    if command_name == "e2e-issue-tutor-grant"
                    else "booking_grant_issued"
                ),
                "operation_id": str(operation_id),
                "request_id": request_id,
                "status": "ok",
            }
        try:
            action = AuditAction(_required(args.action))
        except ValueError as exc:
            raise E2ESupportError("invalid_audit_action") from exc
        verified = await support.verify_audit(
            subject=subject,
            managed_subjects=args.managed_subject,
            action=action,
            request_id=_required(args.request_id),
            correlation_id=_uuid(args.correlation_id) if args.correlation_id else None,
            operation_id=_uuid(args.operation_id) if args.operation_id else None,
        )
        return {
            "account_id": str(verified.account_id),
            "action": verified.action.value,
            "correlation_id": str(verified.correlation_id),
            "event_id": str(verified.event_id),
            "operation": "audit_verified",
            "operation_id": str(verified.operation_id),
            "request_id": verified.request_id,
            "status": "ok",
        }
    finally:
        await support.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Electro Tutor backend diagnostics")
    parser.add_argument(
        "command",
        choices=[
            "doctor",
            "config-check",
            "db-status",
            "db-migrate",
            "db-catalog-snapshot",
            "db-catalog-diagnose",
            "e2e-resolve-account",
            "e2e-issue-tutor-grant",
            "e2e-issue-booking-grant",
            "e2e-verify-audit",
        ],
    )
    parser.add_argument("--subject")
    parser.add_argument("--operation-id")
    parser.add_argument("--correlation-id")
    parser.add_argument("--request-id")
    parser.add_argument("--action")
    parser.add_argument("--managed-subject", action="append", default=[])
    parser.add_argument("--baseline-consent")
    args = parser.parse_args(argv or sys.argv[1:])
    e2e_commands = {
        "e2e-resolve-account",
        "e2e-issue-tutor-grant",
        "e2e-issue-booking-grant",
        "e2e-verify-audit",
    }
    settings_type = (
        Settings if args.command in {"doctor", "config-check", *e2e_commands} else MigrationSettings
    )
    try:
        settings = settings_type()  # type: ignore[call-arg]  # values load from ET_* environment
        provisioning_settings = (
            ProvisioningSettings() if args.command in e2e_commands else None  # type: ignore[call-arg]
        )
    except Exception:  # noqa: BLE001 - deliberately redacted config boundary
        _emit(
            {"code": "invalid_config", "message": "Configuration is invalid.", "status": "error"},
            error=True,
        )
        return 2
    if args.command in e2e_commands:
        assert isinstance(settings, Settings)
        assert isinstance(provisioning_settings, ProvisioningSettings)
        try:
            result: dict[str, Any] = asyncio.run(
                _run_e2e_support(args.command, args, settings, provisioning_settings)
            )
        except E2ESupportError as exc:
            _emit({"code": exc.code, "status": "error"}, error=True)
            return 2 if exc.code.startswith("invalid_") else 1
        except Exception as exc:  # noqa: BLE001 - redacted trusted CLI boundary
            code = getattr(exc, "code", "operation_failed")
            _emit({"code": str(code), "status": "error"}, error=True)
            return 1
        _emit(result)
        return 0
    if isinstance(settings, Settings):
        _emit({"status": "ok", "config": settings.redacted_summary()})
        return 0
    if args.command == "db-status":
        try:
            status = asyncio.run(db_status(settings))
        except Exception:
            print(json.dumps({"status": "unavailable", "dependency": "database"}))
            return 1
        if status["current"] != status["expected"]:
            print(json.dumps({"status": "drift", **status}, sort_keys=True))
            return 1
        try:
            asyncio.run(db_catalog_check(settings))
        except CatalogDriftError:
            print(
                json.dumps(
                    {
                        "status": "drift",
                        "dependency": "database_catalog",
                        "diagnose": "pnpm backend:db:catalog:diagnose",
                    }
                )
            )
            return 1
        except Exception:
            print(json.dumps({"status": "unavailable", "dependency": "database_catalog"}))
            return 1
        print(json.dumps({"status": "ok", "catalog": "current", **status}, sort_keys=True))
        return 0
    if args.command == "db-catalog-snapshot":
        if (
            settings.profile != "test"
            or settings.migration_database_url.rsplit("/", 1)[-1]
            != "electro_tutor_catalog_baseline"
            or args.baseline_consent != "electro-tutor-catalog-baseline"
        ):
            _emit({"status": "error", "code": "baseline_target_denied"}, error=True)
            return 2
        try:
            _emit(asyncio.run(db_catalog_snapshot(settings)))
        except CatalogDriftError:
            _emit({"status": "error", "code": "baseline_catalog_invalid"}, error=True)
            return 1
        except Exception:
            _emit({"status": "error", "code": "baseline_unavailable"}, error=True)
            return 1
        return 0
    if args.command == "db-catalog-diagnose":
        try:
            diagnosis = asyncio.run(db_catalog_diagnose(settings))
            _emit(diagnosis)
        except CatalogDriftError:
            _emit({"status": "error", "code": "catalog_contract_invalid"}, error=True)
            return 1
        except Exception:
            _emit({"status": "error", "code": "catalog_unavailable"}, error=True)
            return 1
        return 0 if diagnosis["status"] == "ok" else 1
    try:
        command.upgrade(alembic_config(settings), "head")
    except Exception:
        print(json.dumps({"status": "migration_failed", "dependency": "database"}))
        return 1
    print(json.dumps({"status": "ok", "revision": expected_revision()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
