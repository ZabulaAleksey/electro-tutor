from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from electro_tutor_api.adapters.auth_repository import AuthRepository
from electro_tutor_api.adapters.database import create_auth_engine
from electro_tutor_api.adapters.unit_of_work import PostgresUnitOfWork
from electro_tutor_api.application.profiles import ProfileService
from electro_tutor_api.cli import main as cli_main
from electro_tutor_api.config import ProvisioningSettings, Settings
from electro_tutor_api.domain.audit import AuditAction
from electro_tutor_api.domain.capability import (
    CapabilityCode,
    CapabilityGrant,
    CapabilityScopeKind,
)
from electro_tutor_api.domain.identity import ExternalIdentity, SessionCredential
from electro_tutor_api.e2e_support import (
    APPROVED_LOCAL_ISSUER,
    E2ESupport,
    E2ESupportError,
    VerifiedAuditEvent,
    _require_managed_subject,
    _validate_local_target,
    _validated_keycloak_subject,
)

PORT = int(os.getenv("ET_TEST_POSTGRES_PORT", "55432"))
RUNTIME_URL = (
    "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
AUTH_URL = (
    "postgresql+asyncpg://electro_tutor_auth_runtime:local-auth-runtime-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
MIGRATION_URL = (
    "postgresql+asyncpg://electro_tutor_migrator:local-migration-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)
PROVISIONING_URL = (
    "postgresql+asyncpg://electro_tutor_provisioner:local-provisioner-only@"
    f"127.0.0.1:{PORT}/electro_tutor_test"
)


def test_e2e_support_rejects_noncanonical_subject_and_cross_profile_database() -> None:
    subject = str(uuid4())
    assert _validated_keycloak_subject(subject) == subject
    with pytest.raises(E2ESupportError, match="invalid_subject"):
        _validated_keycloak_subject(subject.upper())
    with pytest.raises(E2ESupportError, match="invalid_subject"):
        _validated_keycloak_subject("keycloak-user")

    local = Settings(
        profile="local",
        runtime_database_url=RUNTIME_URL.replace("electro_tutor_test", "electro_tutor"),
        auth_database_url=AUTH_URL.replace("electro_tutor_test", "electro_tutor"),
    )
    test_provisioning = ProvisioningSettings(
        profile="test", provisioning_database_url=PROVISIONING_URL
    )
    with pytest.raises(E2ESupportError, match="invalid_e2e_target"):
        _validate_local_target(local, test_provisioning)


def test_e2e_support_privileged_operations_require_exact_two_managed_subjects() -> None:
    subject = str(uuid4())
    second = str(uuid4())
    assert _require_managed_subject(subject, [subject, second]) == subject
    with pytest.raises(E2ESupportError, match="subject_not_managed"):
        _require_managed_subject(str(uuid4()), [subject, second])
    with pytest.raises(E2ESupportError, match="invalid_managed_subjects"):
        _require_managed_subject(subject, [subject])
    with pytest.raises(E2ESupportError, match="subject_not_managed"):
        _require_managed_subject(subject, [subject, subject])


@pytest.mark.parametrize(
    ("target", "suffix"),
    (
        *((target, "?host=remote.example:5432") for target in ("runtime", "auth", "provisioning")),
        *(
            (target, "?user=electro_tutor_migrator")
            for target in ("runtime", "auth", "provisioning")
        ),
        *((target, "?database=foreign") for target in ("runtime", "auth", "provisioning")),
        *((target, "#authority-override") for target in ("runtime", "auth", "provisioning")),
    ),
)
def test_e2e_support_rejects_url_authority_overrides(target: str, suffix: str) -> None:
    settings = Settings(
        profile="test",
        runtime_database_url=RUNTIME_URL,
        auth_database_url=AUTH_URL,
    )
    provisioning = ProvisioningSettings(profile="test", provisioning_database_url=PROVISIONING_URL)
    if target == "runtime":
        settings = settings.model_copy(update={"runtime_database_url": RUNTIME_URL + suffix})
    elif target == "auth":
        settings = settings.model_copy(update={"auth_database_url": AUTH_URL + suffix})
    else:
        provisioning = provisioning.model_copy(
            update={"provisioning_database_url": PROVISIONING_URL + suffix}
        )
    with pytest.raises(E2ESupportError, match="invalid_e2e_target"):
        _validate_local_target(settings, provisioning)


@pytest.mark.parametrize("target", ("runtime", "auth", "provisioning"))
def test_e2e_support_rejects_non_asyncpg_scheme_even_after_settings_boundary(
    target: str,
) -> None:
    settings = Settings(
        profile="test",
        runtime_database_url=RUNTIME_URL,
        auth_database_url=AUTH_URL,
    )
    provisioning = ProvisioningSettings(profile="test", provisioning_database_url=PROVISIONING_URL)
    if target == "runtime":
        settings = settings.model_copy(
            update={"runtime_database_url": RUNTIME_URL.replace("postgresql+asyncpg", "postgresql")}
        )
    elif target == "auth":
        settings = settings.model_copy(
            update={"auth_database_url": AUTH_URL.replace("postgresql+asyncpg", "postgresql")}
        )
    else:
        provisioning = provisioning.model_copy(
            update={
                "provisioning_database_url": PROVISIONING_URL.replace(
                    "postgresql+asyncpg", "postgresql"
                )
            }
        )
    with pytest.raises(E2ESupportError, match="invalid_e2e_target"):
        _validate_local_target(settings, provisioning)


def _set_cli_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ET_ENVIRONMENT", "test")
    monkeypatch.setenv("ET_DATABASE_URL", RUNTIME_URL)
    monkeypatch.setenv("ET_AUTH_DATABASE_URL", AUTH_URL)
    monkeypatch.setenv("ET_PROVISIONING_DATABASE_URL", PROVISIONING_URL)


def test_e2e_cli_emits_stable_redacted_json(monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    _set_cli_environment(monkeypatch)
    account_id = UUID("11111111-1111-4111-8111-111111111111")
    grant_id = UUID("22222222-2222-4222-8222-222222222222")
    event_id = UUID("33333333-3333-4333-8333-333333333333")
    operation_id = UUID("44444444-4444-4444-8444-444444444444")
    correlation_id = UUID("55555555-5555-4555-8555-555555555555")
    subject = UUID("66666666-6666-4666-8666-666666666666")
    second_subject = UUID("77777777-7777-4777-8777-777777777777")

    class FakeSupport:
        def __init__(self, _settings: Settings, _provisioning: ProvisioningSettings) -> None:
            pass

        async def close(self) -> None:
            pass

        async def resolve_account(self, _subject: str) -> UUID:
            return account_id

        async def issue_tutor_grant(self, **_kwargs: object) -> tuple[UUID, CapabilityGrant]:
            now = datetime.now(UTC)
            return account_id, CapabilityGrant(
                id=grant_id,
                subject_account_id=account_id,
                capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
                scope_kind=CapabilityScopeKind.ACCOUNT,
                scope_id=account_id,
                issued_at=now,
                issued_by_actor_type="service",
                issued_by_actor_id="tutor-provisioner",
                issue_operation_id=operation_id,
                revoked_at=None,
                revoked_by_actor_type=None,
                revoked_by_actor_id=None,
                revoke_operation_id=None,
            )

        async def issue_booking_grant(self, **_kwargs: object) -> tuple[UUID, CapabilityGrant]:
            now = datetime.now(UTC)
            return account_id, CapabilityGrant(
                id=grant_id,
                subject_account_id=account_id,
                capability_code=CapabilityCode.TUTOR_BOOKING_MANAGE_OWN,
                scope_kind=CapabilityScopeKind.ACCOUNT,
                scope_id=account_id,
                issued_at=now,
                issued_by_actor_type="service",
                issued_by_actor_id="tutor-provisioner",
                issue_operation_id=operation_id,
                revoked_at=None,
                revoked_by_actor_type=None,
                revoked_by_actor_id=None,
                revoke_operation_id=None,
            )

        async def verify_audit(self, **_kwargs: object) -> VerifiedAuditEvent:
            return VerifiedAuditEvent(
                event_id=event_id,
                action=AuditAction.TUTOR_PROFILE_CREATED,
                account_id=account_id,
                request_id="profile-create",
                correlation_id=correlation_id,
                operation_id=operation_id,
            )

    monkeypatch.setattr("electro_tutor_api.cli.E2ESupport", FakeSupport)

    assert cli_main(["e2e-resolve-account", "--subject", str(subject)]) == 0
    resolved = capsys.readouterr()
    assert resolved.out == (
        '{"account_id":"11111111-1111-4111-8111-111111111111",'
        '"operation":"account_resolved","status":"ok"}\n'
    )

    assert (
        cli_main(
            [
                "e2e-issue-tutor-grant",
                "--subject",
                str(subject),
                "--managed-subject",
                str(subject),
                "--managed-subject",
                str(second_subject),
                "--operation-id",
                str(operation_id),
                "--correlation-id",
                str(correlation_id),
                "--request-id",
                "grant-create",
            ]
        )
        == 0
    )
    issued = capsys.readouterr()
    assert "tutor_grant_issued" in issued.out
    assert "TUTOR_PROFILE_MANAGE_OWN" in issued.out

    assert (
        cli_main(
            [
                "e2e-issue-booking-grant",
                "--subject",
                str(subject),
                "--managed-subject",
                str(subject),
                "--managed-subject",
                str(second_subject),
                "--operation-id",
                str(operation_id),
                "--correlation-id",
                str(correlation_id),
                "--request-id",
                "booking-grant-create",
            ]
        )
        == 0
    )
    booking_issued = capsys.readouterr()
    assert "booking_grant_issued" in booking_issued.out
    assert "TUTOR_BOOKING_MANAGE_OWN" in booking_issued.out

    assert (
        cli_main(
            [
                "e2e-verify-audit",
                "--subject",
                str(subject),
                "--managed-subject",
                str(subject),
                "--managed-subject",
                str(second_subject),
                "--action",
                "tutor_profile.created",
                "--request-id",
                "profile-create",
            ]
        )
        == 0
    )
    verified = capsys.readouterr()
    assert "audit_verified" in verified.out
    combined = (
        resolved.out
        + issued.out
        + booking_issued.out
        + verified.out
        + resolved.err
        + issued.err
        + booking_issued.err
        + verified.err
    )
    assert str(subject) not in combined
    assert "password" not in combined
    assert "token" not in combined


def test_e2e_cli_missing_input_fails_with_stable_redacted_error(
    monkeypatch: pytest.MonkeyPatch, capsys
) -> None:
    _set_cli_environment(monkeypatch)

    class FakeSupport:
        def __init__(self, _settings: Settings, _provisioning: ProvisioningSettings) -> None:
            pass

        async def close(self) -> None:
            pass

    monkeypatch.setattr("electro_tutor_api.cli.E2ESupport", FakeSupport)
    assert cli_main(["e2e-resolve-account"]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == '{"code":"invalid_request","status":"error"}\n'


def integration_settings() -> tuple[Settings, ProvisioningSettings]:
    runtime = os.getenv("ET_TEST_DATABASE_URL") or os.getenv("ET_RUNTIME_DATABASE_URL")
    auth = os.getenv("ET_AUTH_DATABASE_URL")
    provisioning = os.getenv("ET_PROVISIONING_DATABASE_URL")
    migration = os.getenv("ET_MIGRATION_DATABASE_URL")
    if (runtime, auth, provisioning, migration, PORT) != (
        RUNTIME_URL,
        AUTH_URL,
        PROVISIONING_URL,
        MIGRATION_URL,
        55432,
    ):
        pytest.skip("E2E support tests require exact disposable local PostgreSQL roles")
    return (
        Settings(profile="test", runtime_database_url=runtime, auth_database_url=auth),
        ProvisioningSettings(profile="test", provisioning_database_url=provisioning),
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_e2e_support_resolves_issues_idempotently_and_verifies_redacted_audit() -> None:
    settings, provisioning = integration_settings()
    subject = str(uuid4())
    token = f"e2e-support-{uuid4()}"
    credential = SessionCredential.from_token(token)
    auth_repository = AuthRepository(create_auth_engine(settings))
    runtime_engine = create_async_engine(settings.runtime_database_url, hide_parameters=True)
    support = E2ESupport(settings, provisioning)
    try:
        identity_id = await auth_repository.resolve_identity(
            ExternalIdentity(issuer=APPROVED_LOCAL_ISSUER, subject=subject, email=None)
        )
        await auth_repository.create_session(
            token_digest=credential.digest,
            identity_id=identity_id,
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        principal = await auth_repository.principal_for_session(credential.digest)
        assert principal is not None
        account_id = await support.resolve_account(subject)
        assert account_id == principal.account_id

        managed_subjects = [subject, str(uuid4())]
        operation_id = uuid4()
        grant_correlation_id = uuid4()
        issued_account, grant = await support.issue_tutor_grant(
            subject=subject,
            managed_subjects=managed_subjects,
            operation_id=operation_id,
            correlation_id=grant_correlation_id,
            request_id="e2e-grant-create",
        )
        replay_account, replay = await support.issue_tutor_grant(
            subject=subject,
            managed_subjects=managed_subjects,
            operation_id=operation_id,
            correlation_id=grant_correlation_id,
            request_id="e2e-grant-create",
        )
        assert issued_account == replay_account == account_id
        assert grant.id == replay.id

        booking_grant_operation_id = uuid4()
        booking_account, booking_grant = await support.issue_booking_grant(
            subject=subject,
            managed_subjects=managed_subjects,
            operation_id=booking_grant_operation_id,
            correlation_id=uuid4(),
            request_id="e2e-booking-grant-create",
        )
        assert booking_account == account_id
        assert booking_grant.capability_code is CapabilityCode.TUTOR_BOOKING_MANAGE_OWN

        grant_audit = await support.verify_audit(
            subject=subject,
            managed_subjects=managed_subjects,
            action=AuditAction.TUTOR_CAPABILITY_GRANTED,
            request_id="e2e-grant-create",
            correlation_id=grant_correlation_id,
            operation_id=operation_id,
        )
        assert grant_audit.account_id == account_id
        assert grant_audit.correlation_id == grant_correlation_id

        profile_correlation_id = uuid4()
        profile_service = ProfileService(
            lambda bound_credential: PostgresUnitOfWork(runtime_engine, bound_credential)
        )
        await profile_service.create_tutor_profile(
            principal,
            credential,
            "E2E Tutor",
            correlation_id=profile_correlation_id,
            request_id="e2e-profile-create",
        )
        profile_audit = await support.verify_audit(
            subject=subject,
            managed_subjects=managed_subjects,
            action=AuditAction.TUTOR_PROFILE_CREATED,
            request_id="e2e-profile-create",
            correlation_id=profile_correlation_id,
        )
        assert profile_audit.account_id == account_id
        assert profile_audit.correlation_id == profile_correlation_id
        assert token not in repr(profile_audit)
        assert credential.digest not in repr(profile_audit)
    finally:
        await support.close()
        await auth_repository.engine.dispose()
        await runtime_engine.dispose()
