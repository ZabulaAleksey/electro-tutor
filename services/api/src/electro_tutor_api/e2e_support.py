from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from electro_tutor_api.adapters.database import create_auth_engine, create_provisioning_engine
from electro_tutor_api.adapters.provisioning import TrustedProvisioningAdapter
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.capabilities import CapabilityGrantService, UnitOfWorkFactory
from electro_tutor_api.config import ProvisioningSettings, Settings
from electro_tutor_api.domain.audit import AuditAction
from electro_tutor_api.domain.capability import (
    CapabilityCode,
    CapabilityGrant,
    CapabilityReason,
    IssueCapabilityCommand,
)
from electro_tutor_api.request_id import REQUEST_ID_PATTERN

APPROVED_LOCAL_ISSUER = "http://127.0.0.1:58081/realms/electro-tutor-dev"
_APPROVED_AUDIT_ACTIONS = frozenset(
    {AuditAction.TUTOR_CAPABILITY_GRANTED, AuditAction.TUTOR_PROFILE_CREATED}
)


class E2ESupportError(RuntimeError):
    """Stable, redacted failure for the local/test-only E2E support boundary."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class VerifiedAuditEvent:
    event_id: UUID
    action: AuditAction
    account_id: UUID
    request_id: str
    correlation_id: UUID
    operation_id: UUID


class E2ESupport:
    """Trusted local/test orchestration support; never mounted in the public API."""

    def __init__(
        self,
        settings: Settings,
        provisioning_settings: ProvisioningSettings,
        *,
        auth_engine: AsyncEngine | None = None,
        provisioning_engine: AsyncEngine | None = None,
    ) -> None:
        _validate_local_target(settings, provisioning_settings)
        self._auth_engine = auth_engine or create_auth_engine(settings)
        self._provisioning_engine = provisioning_engine or create_provisioning_engine(
            provisioning_settings
        )
        service = CapabilityGrantService(
            cast(UnitOfWorkFactory, lambda: PostgresUnitOfWork(self._provisioning_engine))
        )
        self._provisioner = TrustedProvisioningAdapter(provisioning_settings, service)

    async def close(self) -> None:
        await self._auth_engine.dispose()
        await self._provisioning_engine.dispose()

    async def resolve_account(self, subject: str) -> UUID:
        canonical_subject = _validated_keycloak_subject(subject)
        async with self._auth_engine.connect() as connection:
            result = await connection.execute(
                text(
                    "SELECT account_id FROM public.external_identities "
                    "WHERE issuer=:issuer AND subject=:subject"
                ),
                {"issuer": APPROVED_LOCAL_ISSUER, "subject": canonical_subject},
            )
            account_id = result.scalar_one_or_none()
        if not isinstance(account_id, UUID):
            raise E2ESupportError("account_not_found")
        return account_id

    async def issue_tutor_grant(
        self,
        *,
        subject: str,
        managed_subjects: list[str],
        operation_id: UUID,
        correlation_id: UUID,
        request_id: str,
    ) -> tuple[UUID, CapabilityGrant]:
        return await self._issue_managed_grant(
            subject=subject,
            managed_subjects=managed_subjects,
            capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
            operation_id=operation_id,
            correlation_id=correlation_id,
            request_id=request_id,
        )

    async def issue_booking_grant(
        self,
        *,
        subject: str,
        managed_subjects: list[str],
        operation_id: UUID,
        correlation_id: UUID,
        request_id: str,
    ) -> tuple[UUID, CapabilityGrant]:
        return await self._issue_managed_grant(
            subject=subject,
            managed_subjects=managed_subjects,
            capability_code=CapabilityCode.TUTOR_BOOKING_MANAGE_OWN,
            operation_id=operation_id,
            correlation_id=correlation_id,
            request_id=request_id,
        )

    async def _issue_managed_grant(
        self,
        *,
        subject: str,
        managed_subjects: list[str],
        capability_code: CapabilityCode,
        operation_id: UUID,
        correlation_id: UUID,
        request_id: str,
    ) -> tuple[UUID, CapabilityGrant]:
        _validate_identifiers(operation_id, correlation_id, request_id)
        canonical_subject = _require_managed_subject(subject, managed_subjects)
        account_id = await self.resolve_account(canonical_subject)
        grant = await self._provisioner.issue(
            IssueCapabilityCommand(
                subject_account_id=account_id,
                capability_code=capability_code,
                operation_id=operation_id,
                correlation_id=correlation_id,
                reason=CapabilityReason.TEST,
                request_id=request_id,
            )
        )
        return account_id, grant

    async def verify_audit(
        self,
        *,
        subject: str,
        managed_subjects: list[str],
        action: AuditAction,
        request_id: str,
        correlation_id: UUID | None = None,
        operation_id: UUID | None = None,
    ) -> VerifiedAuditEvent:
        if action not in _APPROVED_AUDIT_ACTIONS:
            raise E2ESupportError("invalid_audit_action")
        if REQUEST_ID_PATTERN.fullmatch(request_id) is None:
            raise E2ESupportError("invalid_request_id")
        canonical_subject = _require_managed_subject(subject, managed_subjects)
        account_id = await self.resolve_account(canonical_subject)
        async with self._provisioning_engine.connect() as connection:
            rows = (
                (
                    await connection.execute(
                        text(
                            "SELECT event_id,actor_type,actor_id,subject_type,subject_id,"
                            "action,result,request_id,correlation_id,operation_id,metadata "
                            "FROM public.audit_events "
                            "WHERE action=:action AND request_id=:request_id "
                            "AND (CAST(:correlation_id AS uuid) IS NULL "
                            "OR correlation_id=CAST(:correlation_id AS uuid)) "
                            "AND (CAST(:operation_id AS uuid) IS NULL "
                            "OR operation_id=CAST(:operation_id AS uuid))"
                        ),
                        {
                            "action": action.value,
                            "request_id": request_id,
                            "correlation_id": correlation_id,
                            "operation_id": operation_id,
                        },
                    )
                )
                .mappings()
                .all()
            )
        matching = [row for row in rows if _audit_belongs_to_account(row, action, account_id)]
        if len(matching) != 1:
            raise E2ESupportError("audit_not_found" if not matching else "audit_not_unique")
        row = matching[0]
        if row["result"] != "succeeded":
            raise E2ESupportError("audit_mismatch")
        return VerifiedAuditEvent(
            event_id=row["event_id"],
            action=action,
            account_id=account_id,
            request_id=row["request_id"],
            correlation_id=row["correlation_id"],
            operation_id=row["operation_id"],
        )


def _validate_local_target(settings: Settings, provisioning_settings: ProvisioningSettings) -> None:
    if (
        settings.profile not in {"local", "test"}
        or provisioning_settings.profile != settings.profile
    ):
        raise E2ESupportError("invalid_e2e_target")
    expected_database = "electro_tutor" if settings.profile == "local" else "electro_tutor_test"
    expected = ("127.0.0.1", 55432, expected_database)
    targets = (
        (settings.runtime_database_url, "electro_tutor_runtime"),
        (settings.auth_database_url, "electro_tutor_auth_runtime"),
        (provisioning_settings.provisioning_database_url, "electro_tutor_provisioner"),
    )
    for value, role in targets:
        parsed = urlsplit(value)
        actual = (parsed.hostname, parsed.port or 5432, parsed.path.removeprefix("/"))
        if (
            parsed.scheme != "postgresql+asyncpg"
            or parsed.username != role
            or actual != expected
            or parsed.query
            or parsed.fragment
        ):
            raise E2ESupportError("invalid_e2e_target")
    if settings.oidc_issuer != APPROVED_LOCAL_ISSUER:
        raise E2ESupportError("invalid_e2e_target")


def _validated_keycloak_subject(subject: str) -> str:
    if not isinstance(subject, str):
        raise E2ESupportError("invalid_subject")
    try:
        parsed = UUID(subject)
    except (ValueError, AttributeError) as exc:
        raise E2ESupportError("invalid_subject") from exc
    canonical = str(parsed)
    if subject != canonical:
        raise E2ESupportError("invalid_subject")
    return canonical


def _require_managed_subject(subject: str, managed_subjects: list[str]) -> str:
    canonical = _validated_keycloak_subject(subject)
    if not isinstance(managed_subjects, list) or len(managed_subjects) != 2:
        raise E2ESupportError("invalid_managed_subjects")
    validated = [_validated_keycloak_subject(value) for value in managed_subjects]
    if len(set(validated)) != 2 or canonical not in validated:
        raise E2ESupportError("subject_not_managed")
    return canonical


def _validate_identifiers(operation_id: UUID, correlation_id: UUID, request_id: str) -> None:
    if not isinstance(operation_id, UUID) or not isinstance(correlation_id, UUID):
        raise E2ESupportError("invalid_identifier")
    if not isinstance(request_id, str) or REQUEST_ID_PATTERN.fullmatch(request_id) is None:
        raise E2ESupportError("invalid_request_id")


def _audit_belongs_to_account(row: Any, action: AuditAction, account_id: UUID) -> bool:
    if action is AuditAction.TUTOR_PROFILE_CREATED:
        return bool(
            row["actor_type"] == "account"
            and row["actor_id"] == str(account_id)
            and row["subject_type"] == "tutor_profile"
            and row["subject_id"] == str(account_id)
            and row["metadata"] == {"profile_type": "tutor", "reason_category": "profile_created"}
        )
    return bool(
        row["actor_type"] == "service"
        and row["actor_id"] == "tutor-provisioner"
        and row["subject_type"] == "capability_grant"
        and row["metadata"].get("capability_code") == CapabilityCode.TUTOR_PROFILE_MANAGE_OWN.value
        and row["metadata"].get("scope_kind") == "account"
        and row["metadata"].get("scope_id") == str(account_id)
        and row["metadata"].get("reason_category") == CapabilityReason.TEST.value
        and row["metadata"].get("grant_id") == row["subject_id"]
    )
