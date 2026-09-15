"""Read-only PostgreSQL catalog contract for handwritten migration objects.

The committed manifest is produced from a *different*, freshly migrated
disposable database. Never derive an expected value from the inspected DB.
"""

from __future__ import annotations

import hashlib
import json
import re
from importlib import resources
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from electro_tutor_api.adapters.database import expected_revision
from electro_tutor_api.schema_contract import metadata as target_metadata

MANIFEST_NAME = "schema_catalog_manifest.json"
CATEGORIES = ("functions", "triggers", "checks", "indexes", "table_acl")
HEX_DIGEST = re.compile(r"[0-9a-f]{64}\Z")


class CatalogDriftError(Exception):
    """Safe diagnostic boundary: never includes SQL bodies or credentials."""


def _fingerprint(value: object) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _acl(row: Any) -> tuple[str, str, bool]:
    return (str(row.grantee), str(row.privilege_type), bool(row.is_grantable))


def _sorted_acl(grants: list[tuple[str, str, bool]]) -> list[tuple[str, str, bool]]:
    return sorted(grants)


async def snapshot_catalog(connection: AsyncConnection) -> dict[str, dict[str, str]]:
    """Fingerprint critical product-owned objects without exporting SQL bodies."""
    tables = set(target_metadata.tables)
    if not tables:
        raise CatalogDriftError("desired schema metadata is empty")

    function_rows = (
        await connection.execute(
            text(
                "SELECT p.oid AS object_id, "
                "format('public.%I(%s)', p.proname, "
                "pg_get_function_identity_arguments(p.oid)) AS object_name, "
                "pg_get_functiondef(p.oid) AS definition, p.prosecdef AS security_definer, "
                "coalesce(p.proconfig, ARRAY[]::text[]) AS config "
                "FROM pg_catalog.pg_proc p "
                "JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace "
                "JOIN pg_catalog.pg_roles owner ON owner.oid = p.proowner "
                "WHERE n.nspname = 'public' AND owner.rolname = 'electro_tutor_migrator' "
                "AND p.prokind = 'f' ORDER BY object_name"
            )
        )
    ).all()
    function_acl_rows = (
        await connection.execute(
            text(
                "SELECT p.oid AS object_id, "
                "CASE WHEN acl.grantee = 0 THEN 'PUBLIC' "
                "ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee, "
                "acl.privilege_type, acl.is_grantable "
                "FROM pg_catalog.pg_proc p "
                "JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace "
                "JOIN pg_catalog.pg_roles owner ON owner.oid = p.proowner "
                "CROSS JOIN LATERAL pg_catalog.aclexplode("
                "coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl "
                "WHERE n.nspname = 'public' AND owner.rolname = 'electro_tutor_migrator' "
                "AND p.prokind = 'f'"
            )
        )
    ).all()
    function_grants: dict[int, list[tuple[str, str, bool]]] = {}
    for row in function_acl_rows:
        function_grants.setdefault(int(row.object_id), []).append(_acl(row))
    functions = {
        str(row.object_name): _fingerprint(
            {
                "definition": str(row.definition),
                "security_definer": bool(row.security_definer),
                "config": sorted(str(item) for item in row.config),
                "acl": _sorted_acl(function_grants.get(int(row.object_id), [])),
            }
        )
        for row in function_rows
    }

    trigger_rows = (
        await connection.execute(
            text(
                "SELECT c.relname AS table_name, t.tgname AS object_name, "
                "pg_catalog.pg_get_triggerdef(t.oid) AS definition, "
                "t.tgenabled AS enabled "
                "FROM pg_catalog.pg_trigger t "
                "JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND NOT t.tgisinternal "
                "ORDER BY c.relname, t.tgname"
            )
        )
    ).all()
    triggers = {
        f"{row.table_name}.{row.object_name}": _fingerprint(
            {"definition": str(row.definition), "enabled": str(row.enabled)}
        )
        for row in trigger_rows
        if str(row.table_name) in tables
    }

    check_rows = (
        await connection.execute(
            text(
                "SELECT c.relname AS table_name, con.conname AS object_name, "
                "pg_catalog.pg_get_constraintdef(con.oid) AS definition, "
                "con.convalidated AS validated "
                "FROM pg_catalog.pg_constraint con "
                "JOIN pg_catalog.pg_class c ON c.oid = con.conrelid "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND con.contype = 'c' "
                "ORDER BY c.relname, con.conname"
            )
        )
    ).all()
    checks = {
        f"{row.table_name}.{row.object_name}": _fingerprint(
            {"definition": str(row.definition), "validated": bool(row.validated)}
        )
        for row in check_rows
        if str(row.table_name) in tables
    }

    index_rows = (
        await connection.execute(
            text(
                "SELECT c.relname AS table_name, idx.relname AS object_name, "
                "pg_catalog.pg_get_indexdef(idx.oid) AS definition, "
                "pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) AS predicate, "
                "ix.indisvalid AS valid, ix.indisready AS ready "
                "FROM pg_catalog.pg_index ix "
                "JOIN pg_catalog.pg_class idx ON idx.oid = ix.indexrelid "
                "JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' ORDER BY c.relname, idx.relname"
            )
        )
    ).all()
    indexes = {
        f"{row.table_name}.{row.object_name}": _fingerprint(
            {
                "definition": str(row.definition),
                "predicate": str(row.predicate) if row.predicate is not None else None,
                "valid": bool(row.valid),
                "ready": bool(row.ready),
            }
        )
        for row in index_rows
        if str(row.table_name) in tables
    }

    table_rows = (
        await connection.execute(
            text(
                "SELECT c.oid AS object_id, c.relname AS object_name, "
                "c.relrowsecurity AS row_security, c.relforcerowsecurity AS force_row_security "
                "FROM pg_catalog.pg_class c "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')"
            )
        )
    ).all()
    table_acl_rows = (
        await connection.execute(
            text(
                "SELECT c.oid AS object_id, "
                "CASE WHEN acl.grantee = 0 THEN 'PUBLIC' "
                "ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee, "
                "acl.privilege_type, acl.is_grantable "
                "FROM pg_catalog.pg_class c "
                "JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace "
                "CROSS JOIN LATERAL pg_catalog.aclexplode("
                "coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl "
                "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')"
            )
        )
    ).all()
    table_grants: dict[int, list[tuple[str, str, bool]]] = {}
    for row in table_acl_rows:
        table_grants.setdefault(int(row.object_id), []).append(_acl(row))
    table_acl = {
        str(row.object_name): _fingerprint(
            {
                "acl": _sorted_acl(table_grants.get(int(row.object_id), [])),
                "row_security": bool(row.row_security),
                "force_row_security": bool(row.force_row_security),
            }
        )
        for row in table_rows
        if str(row.object_name) in tables
    }
    if set(table_acl) != tables:
        raise CatalogDriftError("desired product tables are missing from database catalog")
    return {
        "functions": functions,
        "triggers": triggers,
        "checks": checks,
        "indexes": indexes,
        "table_acl": table_acl,
    }


def snapshot_manifest(objects: dict[str, dict[str, str]]) -> dict[str, object]:
    return {"schema_version": 1, "revision": expected_revision(), "objects": objects}


def load_manifest() -> dict[str, object]:
    try:
        raw = resources.files("electro_tutor_api").joinpath(MANIFEST_NAME).read_text("utf-8")
        manifest = json.loads(raw)
    except (OSError, ValueError) as exc:
        raise CatalogDriftError("catalog manifest is missing or invalid") from exc
    if (
        not isinstance(manifest, dict)
        or manifest.get("schema_version") != 1
        or manifest.get("revision") != expected_revision()
        or not isinstance(manifest.get("objects"), dict)
    ):
        raise CatalogDriftError("catalog manifest revision or shape is invalid")
    objects = manifest["objects"]
    if set(objects) != set(CATEGORIES):
        raise CatalogDriftError("catalog manifest categories are invalid")
    for category in CATEGORIES:
        entries = objects[category]
        if not isinstance(entries, dict) or not entries:
            raise CatalogDriftError("catalog manifest category is empty or invalid")
        if any(
            not isinstance(key, str)
            or not isinstance(value, str)
            or not HEX_DIGEST.fullmatch(value)
            for key, value in entries.items()
        ):
            raise CatalogDriftError("catalog manifest fingerprint is invalid")
    return manifest


def compare_catalog(actual: dict[str, dict[str, str]], manifest: dict[str, object]) -> None:
    expected = manifest["objects"]
    if not isinstance(expected, dict):
        raise CatalogDriftError("catalog manifest is invalid")
    for category in CATEGORIES:
        expected_entries = expected.get(category)
        if not isinstance(expected_entries, dict) or actual[category] != expected_entries:
            raise CatalogDriftError(f"database catalog drift detected in {category}")


def catalog_differences(
    actual: dict[str, dict[str, str]], manifest: dict[str, object]
) -> dict[str, dict[str, object]]:
    """Diagnostics list only committed expected identifiers, never live SQL or hashes."""
    expected = manifest["objects"]
    if not isinstance(expected, dict):
        raise CatalogDriftError("catalog manifest is invalid")
    differences: dict[str, dict[str, object]] = {}
    for category in CATEGORIES:
        expected_entries = expected.get(category)
        if not isinstance(expected_entries, dict):
            raise CatalogDriftError("catalog manifest is invalid")
        found = actual[category]
        missing = sorted(set(expected_entries) - set(found))
        changed = sorted(
            key for key in set(found) & set(expected_entries) if found[key] != expected_entries[key]
        )
        unexpected_count = len(set(found) - set(expected_entries))
        if missing or changed or unexpected_count:
            differences[category] = {
                "missing_expected": missing,
                "changed_expected": changed,
                "unexpected_count": unexpected_count,
            }
    return differences


async def verify_catalog(connection: AsyncConnection) -> None:
    current = await connection.scalar(text("SELECT version_num FROM alembic_version"))
    if current != expected_revision():
        raise CatalogDriftError("database revision does not match catalog manifest")
    compare_catalog(await snapshot_catalog(connection), load_manifest())
