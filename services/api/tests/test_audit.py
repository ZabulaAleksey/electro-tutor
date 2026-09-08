from __future__ import annotations

import inspect
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from starlette.requests import Request

from electro_tutor_api.adapters.audit_repository import PostgresAuditEventRepository
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.audit import (
    AuditAction,
    AuditActor,
    AuditActorType,
    AuditResult,
    AuditSubjectType,
    AuditValidationError,
    NewAuditEvent,
    TrustedAuditService,
)
from electro_tutor_api.domain.identity import Principal
from electro_tutor_api.errors import AuditUnavailableError
from electro_tutor_api.main import create_app


def valid_event(**overrides: object) -> NewAuditEvent:
    values: dict[str, object] = {
        "actor": AuditActor.from_trusted_service(TrustedAuditService.TUTOR_PROVISIONER),
        "subject_type": AuditSubjectType.ACCOUNT,
        "subject_id": str(uuid4()),
        "action": AuditAction.TUTOR_CAPABILITY_GRANTED,
        "result": AuditResult.SUCCEEDED,
        "request_id": "et-audit-unit",
        "correlation_id": uuid4(),
        "operation_id": uuid4(),
        "metadata": {
            "capability_code": "TUTOR_PROFILE_MANAGE_OWN",
            "scope_kind": "account",
        },
    }
    values.update(overrides)
    return NewAuditEvent(**values)  # type: ignore[arg-type]


def test_valid_audit_event_is_typed_and_defensively_copies_metadata() -> None:
    metadata = {"profile_type": "tutor"}
    event = valid_event(
        action=AuditAction.TUTOR_PROFILE_CREATED,
        subject_type=AuditSubjectType.TUTOR_PROFILE,
        metadata=metadata,
    )
    metadata["profile_type"] = "mutated"
    assert event.metadata == {"profile_type": "tutor"}
    with pytest.raises(TypeError):
        event.metadata["profile_type"] = "mutated"  # type: ignore[index]


def test_server_controlled_fields_are_absent_from_construction_boundary() -> None:
    parameters = inspect.signature(NewAuditEvent).parameters
    assert "event_id" not in parameters
    assert "schema_version" not in parameters
    assert "occurred_at" not in parameters
    assert "actor_type" not in parameters
    assert "actor_id" not in parameters


def test_actor_can_only_be_derived_from_principal_or_allowlisted_service() -> None:
    principal = Principal(
        identity_id=uuid4(),
        issuer="https://provider.invalid/realm",
        subject="provider-subject",
        email="private@invalid.example",
        session_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    account_actor = AuditActor.from_principal(principal)
    assert account_actor.actor_type is AuditActorType.ACCOUNT
    assert account_actor.actor_id == str(principal.identity_id)
    with pytest.raises(AuditValidationError, match="allowlisted"):
        AuditActor.from_trusted_service("client-service")  # type: ignore[arg-type]
    with pytest.raises(AuditValidationError, match="factory"):
        valid_event(actor={"actor_type": "service", "actor_id": "client-service"})


def test_metadata_over_sixteen_keys_is_rejected_before_allowlist_evaluation() -> None:
    with pytest.raises(AuditValidationError, match="at most 16 keys"):
        valid_event(metadata={f"key_{index}": index for index in range(17)})


def test_metadata_over_4096_serialized_bytes_is_rejected() -> None:
    with pytest.raises(AuditValidationError, match="4096 bytes"):
        valid_event(metadata={"reason_category": "я" * 4096})


@pytest.mark.parametrize(
    "metadata",
    [
        {"reason_category": {"nested": "forbidden"}},
        {"reason_category": ["nested", "forbidden"]},
    ],
)
def test_nested_metadata_is_rejected(metadata: object) -> None:
    with pytest.raises(AuditValidationError, match="typed string"):
        valid_event(metadata=metadata)


@pytest.mark.parametrize(
    "forbidden_key",
    [
        "access_token",
        "refresh_token",
        "provider_token",
        "secret",
        "email",
        "display_name",
        "session",
        "request_body",
        "profile_body",
    ],
)
def test_private_or_secret_metadata_keys_are_rejected(forbidden_key: str) -> None:
    with pytest.raises(AuditValidationError, match="not allowed"):
        valid_event(metadata={forbidden_key: "must-not-persist"})


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("capability_code", "access-token-shaped-value"),
        ("scope_kind", "private@example.invalid"),
        ("scope_id", "full request body"),
        ("grant_id", "secret"),
        ("reason_category", "eyJhbGciOiJub25lIn0.payload.signature"),
    ],
)
def test_sensitive_or_untyped_values_cannot_hide_under_allowed_keys(key: str, value: str) -> None:
    with pytest.raises(AuditValidationError):
        valid_event(metadata={key: value})


@pytest.mark.parametrize("request_id", [" bad", "bad/id", "bad?id", "bad\nvalue"])
def test_request_id_reuses_existing_api_contract(request_id: str) -> None:
    with pytest.raises(AuditValidationError):
        valid_event(request_id=request_id)


def test_unknown_action_or_untyped_envelope_values_are_rejected() -> None:
    with pytest.raises(AuditValidationError, match="AuditAction"):
        valid_event(action="tutor_capability.granted")
    with pytest.raises(AuditValidationError, match="must be a string"):
        valid_event(subject_id=123)


def test_audit_repository_has_no_product_update_or_delete_path() -> None:
    assert not hasattr(PostgresAuditEventRepository, "update")
    assert not hasattr(PostgresAuditEventRepository, "delete")


def test_audit_unavailable_error_has_stable_external_contract() -> None:
    error = AuditUnavailableError()
    assert error.code == "audit_unavailable"
    assert error.status_code == 503
    assert "audit" in error.message.lower()


@pytest.mark.asyncio
async def test_audit_unavailable_handler_is_redacted_503_without_probe_endpoint() -> None:
    settings = Settings(
        profile="test",
        runtime_database_url=(
            "postgresql+asyncpg://electro_tutor_runtime:local-runtime-only@"
            "127.0.0.1:55432/electro_tutor_test"
        ),
    )
    app = create_app(settings)
    request = Request({"type": "http", "method": "POST", "path": "/internal"})
    request.state.request_id = "audit-handler-test"
    handler = app.exception_handlers[AuditUnavailableError]
    response = await handler(request, AuditUnavailableError())  # type: ignore[arg-type]
    payload = json.loads(response.body)
    assert response.status_code == 503
    assert payload == {
        "error": {
            "code": "audit_unavailable",
            "message": "Critical operation could not be durably audited.",
            "request_id": "audit-handler-test",
            "details": {},
        }
    }
    assert "postgresql" not in response.body.decode()
