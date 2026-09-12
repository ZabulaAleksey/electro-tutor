from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from electro_tutor_api.application.auth import AuthFlowError, LoginComplete, LoginStart
from electro_tutor_api.config import Settings
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.profile import (
    StudentProfile,
    TutorProfile,
    normalize_display_name,
)
from electro_tutor_api.errors import (
    AuditUnavailableError,
    CapabilityRequiredError,
    ProfileAlreadyExistsError,
    ProfileNotFoundError,
)
from electro_tutor_api.main import create_app

BASE = {
    "runtime_database_url": (
        "postgresql+asyncpg://electro_tutor_runtime:runtime-password@127.0.0.1:55432/electro_tutor"
    ),
    "auth_database_url": (
        "postgresql+asyncpg://electro_tutor_auth_runtime:auth-password@"
        "127.0.0.1:55432/electro_tutor"
    ),
}
ACCOUNT_ID = UUID("11111111-1111-4111-8111-111111111111")
FOREIGN_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
NOW = datetime(2026, 9, 12, tzinfo=UTC)


class FakeAuthService:
    async def principal(self, session_token: str | None) -> Principal | None:
        if session_token != "valid-session":
            return None
        return Principal(
            account_id=ACCOUNT_ID,
            identity_id=UUID("22222222-2222-4222-8222-222222222222"),
            issuer="https://issuer.invalid",
            subject="subject",
            email=None,
            session_expires_at=NOW + timedelta(minutes=5),
        )

    @staticmethod
    def session_credential(session_token: str | None) -> SessionCredential | None:
        if session_token is None:
            return None
        return SessionCredential.from_token(session_token)

    async def begin_login(self, _return_to: str) -> LoginStart:
        raise AssertionError("not used")

    async def complete_login(self, **_kwargs: object) -> LoginComplete:
        raise AssertionError("not used")

    async def logout(self, _session_token: str | None, _redirect: str) -> str:
        raise AuthFlowError("not_used", "not used")


class FakeProfileService:
    def __init__(self) -> None:
        self.student: StudentProfile | None = None
        self.tutor: TutorProfile | None = None
        self.failures: dict[str, Exception] = {}
        self.calls: list[str] = []
        self.tutor_correlation_id: UUID | None = None
        self.tutor_request_id: str | None = None

    def _fail(self, operation: str) -> None:
        failure = self.failures.get(operation)
        if failure is not None:
            raise failure

    async def create_student_profile(
        self, _principal: Principal, _credential: SessionCredential, display_name: str
    ) -> StudentProfile:
        self.calls.append("create_student")
        self._fail("create_student")
        normalized = normalize_display_name(display_name)
        self.student = self.student or StudentProfile(ACCOUNT_ID, normalized, NOW, NOW)
        return self.student

    async def read_student_profile(
        self, _principal: Principal, _credential: SessionCredential
    ) -> StudentProfile:
        self.calls.append("read_student")
        self._fail("read_student")
        if self.student is None:
            raise ProfileNotFoundError()
        return self.student

    async def update_student_profile(
        self, _principal: Principal, _credential: SessionCredential, display_name: str
    ) -> StudentProfile:
        self.calls.append("update_student")
        self._fail("update_student")
        if self.student is None:
            raise ProfileNotFoundError()
        self.student = StudentProfile(
            ACCOUNT_ID, normalize_display_name(display_name), self.student.created_at, NOW
        )
        return self.student

    async def create_tutor_profile(
        self,
        _principal: Principal,
        _credential: SessionCredential,
        display_name: str,
        *,
        correlation_id: UUID | None = None,
        request_id: str | None = None,
    ) -> TutorProfile:
        self.calls.append("create_tutor")
        self._fail("create_tutor")
        self.tutor_correlation_id = correlation_id
        self.tutor_request_id = request_id
        normalized = normalize_display_name(display_name)
        self.tutor = self.tutor or TutorProfile(ACCOUNT_ID, normalized, NOW, NOW)
        return self.tutor

    async def read_tutor_profile(
        self, _principal: Principal, _credential: SessionCredential
    ) -> TutorProfile:
        self.calls.append("read_tutor")
        self._fail("read_tutor")
        if self.tutor is None:
            raise ProfileNotFoundError()
        return self.tutor

    async def update_tutor_profile(
        self, _principal: Principal, _credential: SessionCredential, display_name: str
    ) -> TutorProfile:
        self.calls.append("update_tutor")
        self._fail("update_tutor")
        if self.tutor is None:
            raise ProfileNotFoundError()
        self.tutor = TutorProfile(
            ACCOUNT_ID, normalize_display_name(display_name), self.tutor.created_at, NOW
        )
        return self.tutor


async def healthy() -> str:
    return "head"


def app_for(service: FakeProfileService):
    return create_app(  # type: ignore[arg-type]
        Settings(**BASE, profile="test"),
        check_database=healthy,
        auth_service=FakeAuthService(),
        profile_service=service,
    )


def assert_error(response, status: int, code: str, request_id: str) -> None:
    assert response.status_code == status
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Request-ID"] == request_id
    assert response.json()["error"] == {
        "code": code,
        "message": response.json()["error"]["message"],
        "request_id": request_id,
        "details": {},
    }


@pytest.mark.asyncio
async def test_profile_routes_create_read_update_and_forward_tutor_correlation() -> None:
    service = FakeProfileService()
    async with AsyncClient(
        transport=ASGITransport(app=app_for(service)), base_url="http://test"
    ) as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        student = await client.put(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            json={"display_name": " Student   Name "},
        )
        student_read = await client.get(f"/api/v1/profiles/student/{ACCOUNT_ID}")
        student_update = await client.patch(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            json={"display_name": "Updated Student"},
        )
        tutor = await client.put(
            f"/api/v1/profiles/tutor/{ACCOUNT_ID}",
            json={"display_name": "Tutor"},
            headers={"X-Request-ID": "profile-tutor-create"},
        )
        tutor_read = await client.get(f"/api/v1/profiles/tutor/{ACCOUNT_ID}")
        tutor_update = await client.patch(
            f"/api/v1/profiles/tutor/{ACCOUNT_ID}",
            json={"display_name": "Updated Tutor"},
        )

    assert student.status_code == student_read.status_code == student_update.status_code == 200
    assert student.json()["display_name"] == "Student Name"
    assert student_update.json()["display_name"] == "Updated Student"
    assert tutor.status_code == tutor_read.status_code == tutor_update.status_code == 200
    assert tutor_update.json()["display_name"] == "Updated Tutor"
    assert service.tutor_request_id == "profile-tutor-create"
    assert isinstance(service.tutor_correlation_id, UUID)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("operation", "error", "status", "code"),
    (
        ("read_student", ProfileNotFoundError(), 404, "profile_not_found"),
        ("read_tutor", CapabilityRequiredError(), 403, "capability_required"),
        ("create_student", ProfileAlreadyExistsError(), 409, "profile_already_exists"),
        ("create_tutor", AuditUnavailableError(), 503, "audit_unavailable"),
    ),
)
async def test_profile_error_matrix(
    operation: str, error: Exception, status: int, code: str
) -> None:
    service = FakeProfileService()
    service.student = StudentProfile(ACCOUNT_ID, "Student", NOW, NOW)
    service.tutor = TutorProfile(ACCOUNT_ID, "Tutor", NOW, NOW)
    service.failures[operation] = error
    method, kind = {
        "read_student": ("GET", "student"),
        "read_tutor": ("GET", "tutor"),
        "create_student": ("PUT", "student"),
        "create_tutor": ("PUT", "tutor"),
    }[operation]
    request_id = f"error-{code}"
    async with AsyncClient(
        transport=ASGITransport(app=app_for(service)), base_url="http://test"
    ) as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        response = await client.request(
            method,
            f"/api/v1/profiles/{kind}/{ACCOUNT_ID}",
            json={"display_name": "Name"} if method == "PUT" else None,
            headers={"X-Request-ID": request_id},
        )
    assert_error(response, status, code, request_id)


@pytest.mark.asyncio
async def test_anonymous_invalid_and_foreign_profile_requests_fail_closed() -> None:
    service = FakeProfileService()
    async with AsyncClient(
        transport=ASGITransport(app=app_for(service)), base_url="http://test"
    ) as client:
        anonymous = await client.get(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            headers={"X-Request-ID": "anonymous-profile"},
        )
        anonymous_invalid = await client.put(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            json={"role": "tutor"},
            headers={"X-Request-ID": "anonymous-invalid-profile"},
        )
        anonymous_malformed = await client.put(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            content=b'{"display_name":',
            headers={
                "Content-Type": "application/json",
                "X-Request-ID": "anonymous-malformed-profile",
            },
        )
        client.cookies.set("et_session", "invalid-session", path="/api/v1")
        invalid = await client.get(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            headers={"X-Request-ID": "invalid-profile"},
        )
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        foreign_read = await client.get(
            f"/api/v1/profiles/student/{FOREIGN_ID}",
            headers={"X-Request-ID": "foreign-read"},
        )
        foreign_write = await client.put(
            f"/api/v1/profiles/tutor/{FOREIGN_ID}",
            json={"display_name": "Foreign"},
            headers={"X-Request-ID": "foreign-write"},
        )
        foreign_invalid = await client.put(
            f"/api/v1/profiles/tutor/{FOREIGN_ID}",
            json={"role": "tutor"},
            headers={"X-Request-ID": "foreign-invalid"},
        )
        foreign_malformed = await client.patch(
            f"/api/v1/profiles/tutor/{FOREIGN_ID}",
            content=b'{"display_name":',
            headers={
                "Content-Type": "application/json",
                "X-Request-ID": "foreign-malformed",
            },
        )
    assert_error(anonymous, 401, "authentication_required", "anonymous-profile")
    assert_error(anonymous_invalid, 401, "authentication_required", "anonymous-invalid-profile")
    assert_error(
        anonymous_malformed,
        401,
        "authentication_required",
        "anonymous-malformed-profile",
    )
    assert_error(invalid, 401, "authentication_required", "invalid-profile")
    assert_error(foreign_read, 404, "profile_not_found", "foreign-read")
    assert_error(foreign_write, 404, "profile_not_found", "foreign-write")
    assert_error(foreign_invalid, 404, "profile_not_found", "foreign-invalid")
    assert_error(foreign_malformed, 404, "profile_not_found", "foreign-malformed")
    assert service.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    (
        {},
        {"display_name": "Name", "account_id": str(FOREIGN_ID)},
        {"display_name": "Name", "role": "tutor"},
        {"display_name": "Name", "is_admin": True},
        {"display_name": "Name", "unknown": "value"},
        {"display_name": ""},
    ),
)
async def test_profile_body_rejects_invalid_unknown_and_authority_fields(
    payload: dict[str, object],
) -> None:
    service = FakeProfileService()
    async with AsyncClient(
        transport=ASGITransport(app=app_for(service)), base_url="http://test"
    ) as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        response = await client.put(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            json=payload,
            headers={"X-Request-ID": "invalid-profile-body"},
        )
    assert_error(response, 422, "invalid_request", "invalid-profile-body")


@pytest.mark.asyncio
async def test_own_malformed_json_is_invalid_request_after_access_checks() -> None:
    service = FakeProfileService()
    async with AsyncClient(
        transport=ASGITransport(app=app_for(service)), base_url="http://test"
    ) as client:
        client.cookies.set("et_session", "valid-session", path="/api/v1")
        response = await client.patch(
            f"/api/v1/profiles/student/{ACCOUNT_ID}",
            content=b'{"display_name":',
            headers={
                "Content-Type": "application/json",
                "X-Request-ID": "own-malformed-profile",
            },
        )
    assert_error(response, 422, "invalid_request", "own-malformed-profile")
    assert service.calls == []


def test_injected_services_and_health_do_not_create_database_engines(monkeypatch) -> None:
    def unexpected_engine(_settings: Settings):
        raise AssertionError("injected app must not create a database engine")

    monkeypatch.setattr("electro_tutor_api.main.create_runtime_engine", unexpected_engine)
    monkeypatch.setattr("electro_tutor_api.main.create_auth_engine", unexpected_engine)
    app_for(FakeProfileService())


@pytest.mark.asyncio
async def test_default_app_attempts_to_dispose_both_owned_engines(monkeypatch) -> None:
    disposed: list[str] = []

    class DisposableEngine:
        def __init__(self, name: str, fail: bool = False) -> None:
            self.name = name
            self.fail = fail

        async def dispose(self) -> None:
            disposed.append(self.name)
            if self.fail:
                raise RuntimeError("synthetic disposal failure")

    runtime = DisposableEngine("runtime", fail=True)
    auth = DisposableEngine("auth")
    monkeypatch.setattr("electro_tutor_api.main.create_runtime_engine", lambda _settings: runtime)
    monkeypatch.setattr("electro_tutor_api.main.create_auth_engine", lambda _settings: auth)
    app = create_app(Settings(**BASE, profile="test"))  # type: ignore[arg-type]
    async with app.router.lifespan_context(app):
        pass
    assert disposed == ["runtime", "auth"]


def test_openapi_registers_only_private_profile_routes() -> None:
    schema = app_for(FakeProfileService()).openapi()
    assert {
        "/api/v1/profiles/{profile_kind}/{account_id}",
    } <= set(schema["paths"])
    assert not any("grant" in path or "capabilit" in path for path in schema["paths"])
