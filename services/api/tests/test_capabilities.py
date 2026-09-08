from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from electro_tutor_api.adapters.provisioning import TrustedProvisioningAdapter
from electro_tutor_api.application.capabilities import (
    AUTHORIZATION_MATRIX_VERSION,
    CapabilityEvaluator,
    CapabilityGrantService,
)
from electro_tutor_api.config import ProvisioningSettings, Settings
from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityCode,
    CapabilityGrant,
    CapabilityReason,
    CapabilityScopeKind,
    CapabilityValidationError,
    IssueCapabilityCommand,
    TrustedAuthorityService,
    TutorProfileOperation,
)
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.errors import AuthorityDeniedError
from electro_tutor_api.main import create_app


class FakeCapabilityRepository:
    def __init__(self, grants: dict[tuple[UUID, CapabilityCode], CapabilityGrant]) -> None:
        self.grants = grants

    async def get_active(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> CapabilityGrant | None:
        del for_update
        return self.grants.get((account_id, capability_code))


class FakeUnitOfWork:
    def __init__(self, repository: FakeCapabilityRepository) -> None:
        self.capability_grants = repository
        self.audit_events = cast(Any, None)

    async def __aenter__(self) -> FakeUnitOfWork:
        return self

    async def __aexit__(self, *_args: object) -> bool:
        return False


def principal(account_id: UUID, *, identity_id: UUID | None = None) -> Principal:
    return Principal(
        account_id=account_id,
        identity_id=identity_id or uuid4(),
        issuer="https://issuer.invalid",
        subject=str(uuid4()),
        email="ignored@example.invalid",
        session_expires_at=datetime.now(UTC),
    )


def active_grant(account_id: UUID) -> CapabilityGrant:
    return CapabilityGrant(
        id=uuid4(),
        subject_account_id=account_id,
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        scope_kind=CapabilityScopeKind.ACCOUNT,
        scope_id=account_id,
        issued_at=datetime.now(UTC),
        issued_by_actor_type="service",
        issued_by_actor_id="tutor-provisioner",
        issue_operation_id=uuid4(),
        revoked_at=None,
        revoked_by_actor_type=None,
        revoked_by_actor_id=None,
        revoke_operation_id=None,
    )


@pytest.mark.parametrize("operation", list(TutorProfileOperation))
@pytest.mark.asyncio
async def test_authorization_matrix_allows_only_own_tutor_operation_with_active_grant(
    operation: TutorProfileOperation,
) -> None:
    account_id = uuid4()
    repository = FakeCapabilityRepository(
        {(account_id, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN): active_grant(account_id)}
    )
    evaluator = CapabilityEvaluator(lambda: cast(Any, FakeUnitOfWork(repository)))

    assert await evaluator.authorize(principal(account_id), operation, account_id) is True
    assert AUTHORIZATION_MATRIX_VERSION == 1


@pytest.mark.parametrize("case", ["anonymous", "foreign", "missing", "invalid-operation"])
@pytest.mark.asyncio
async def test_authorization_matrix_denies_without_exact_server_side_prerequisites(
    case: str,
) -> None:
    account_id = uuid4()
    foreign_id = uuid4()
    grants = {(account_id, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN): active_grant(account_id)}
    if case == "missing":
        grants = {}
    evaluator = CapabilityEvaluator(
        lambda: cast(Any, FakeUnitOfWork(FakeCapabilityRepository(grants)))
    )
    actor = None if case == "anonymous" else principal(account_id)
    owner = foreign_id if case == "foreign" else account_id
    operation = (
        cast(TutorProfileOperation, "client-provided-role")
        if case == "invalid-operation"
        else TutorProfileOperation.CREATE_OWN
    )

    assert await evaluator.authorize(actor, operation, owner) is False


@pytest.mark.asyncio
async def test_evaluator_uses_account_not_provider_identity_or_email() -> None:
    account_id = uuid4()
    grant = active_grant(account_id)
    evaluator = CapabilityEvaluator(
        lambda: cast(
            Any,
            FakeUnitOfWork(
                FakeCapabilityRepository(
                    {(account_id, CapabilityCode.TUTOR_PROFILE_MANAGE_OWN): grant}
                )
            ),
        )
    )
    first = principal(account_id, identity_id=uuid4())
    second = principal(account_id, identity_id=uuid4())

    assert first.identity_id != second.identity_id
    assert await evaluator.authorize(first, TutorProfileOperation.READ_OWN, account_id) is True
    assert await evaluator.authorize(second, TutorProfileOperation.READ_OWN, account_id) is True
    assert (
        await evaluator.has_capability(
            cast(UUID, "oidc-role"), cast(CapabilityCode, "TUTOR_PROFILE_MANAGE_OWN")
        )
        is False
    )


def test_capability_commands_and_authority_actor_reject_untyped_client_values() -> None:
    with pytest.raises(CapabilityValidationError):
        IssueCapabilityCommand(
            subject_account_id=uuid4(),
            capability_code=cast(CapabilityCode, "tutor"),
            operation_id=uuid4(),
            correlation_id=uuid4(),
        )
    with pytest.raises(CapabilityValidationError):
        IssueCapabilityCommand(
            subject_account_id=uuid4(),
            capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
            operation_id=uuid4(),
            correlation_id=cast(UUID, "not-a-uuid"),
        )
    with pytest.raises(CapabilityValidationError):
        IssueCapabilityCommand(
            subject_account_id=uuid4(),
            capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
            operation_id=uuid4(),
            correlation_id=uuid4(),
            reason=cast(CapabilityReason, "bad"),
        )
    with pytest.raises(CapabilityValidationError):
        IssueCapabilityCommand(
            subject_account_id=uuid4(),
            capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
            operation_id=uuid4(),
            correlation_id=uuid4(),
            request_id="contains spaces",
        )
    with pytest.raises(CapabilityValidationError):
        AuthorityActor.from_trusted_service(cast(TrustedAuthorityService, "oidc-admin"))
    with pytest.raises(TypeError):
        AuthorityActor()  # type: ignore[call-arg]


@pytest.mark.asyncio
async def test_grant_service_rejects_non_authority_actor_before_uow() -> None:
    service = CapabilityGrantService(lambda: cast(Any, None))
    command = IssueCapabilityCommand(
        subject_account_id=uuid4(),
        capability_code=CapabilityCode.TUTOR_PROFILE_MANAGE_OWN,
        operation_id=uuid4(),
        correlation_id=uuid4(),
        reason=CapabilityReason.TEST,
    )

    with pytest.raises(AuthorityDeniedError):
        await service.issue(command, cast(AuthorityActor, object()))


def test_provisioning_settings_require_dedicated_database_role() -> None:
    with pytest.raises(ValueError, match="provisioner role"):
        ProvisioningSettings(
            profile="test",
            provisioning_database_url=(
                "postgresql+asyncpg://electro_tutor_runtime:password@"
                "127.0.0.1:55432/electro_tutor_test"
            ),
        )


def test_no_public_capability_grant_or_revoke_route_exists() -> None:
    app = create_app(
        Settings(
            profile="test",
            runtime_database_url=(
                "postgresql+asyncpg://electro_tutor_runtime:password@127.0.0.1:55432/electro_tutor"
            ),
        )
    )
    paths = [getattr(route, "path", "") for route in app.routes]
    assert all("capabil" not in path and "grant" not in path for path in paths)


def test_trusted_adapter_builds_actor_only_from_server_settings() -> None:
    settings = ProvisioningSettings(
        profile="test",
        provisioning_database_url=(
            "postgresql+asyncpg://electro_tutor_provisioner:password@"
            "127.0.0.1:55432/electro_tutor_test"
        ),
    )
    adapter = TrustedProvisioningAdapter(settings, cast(Any, object()))
    assert adapter._actor == AuthorityActor.from_trusted_service(  # noqa: SLF001
        TrustedAuthorityService.TUTOR_PROVISIONER
    )
