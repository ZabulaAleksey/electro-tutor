from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from electro_tutor_api.application.profiles import ProfileService
from electro_tutor_api.domain.capability import CapabilityCode
from electro_tutor_api.domain.identity import Principal, SessionCredential
from electro_tutor_api.domain.profile import (
    ProfileValidationError,
    StudentProfile,
    TutorProfile,
    normalize_display_name,
)
from electro_tutor_api.errors import (
    AuditUnavailableError,
    AuthenticationRequiredError,
    CapabilityRequiredError,
    ProfileAlreadyExistsError,
    ProfileNotFoundError,
)


def principal(account_id: UUID | None = None) -> Principal:
    return Principal(
        account_id=account_id or uuid4(),
        identity_id=uuid4(),
        issuer="https://issuer.invalid",
        subject=str(uuid4()),
        email=None,
        session_expires_at=datetime.now(UTC),
    )


class FakeCapabilityRepository:
    def __init__(self, active_accounts: set[UUID], calls: list[str]) -> None:
        self.active_accounts = active_accounts
        self.calls = calls

    async def get_active(
        self,
        account_id: UUID,
        capability_code: CapabilityCode,
        *,
        for_update: bool = False,
    ) -> object | None:
        assert capability_code is CapabilityCode.TUTOR_PROFILE_MANAGE_OWN
        self.calls.append("grant-lock" if for_update else "grant-read")
        return object() if account_id in self.active_accounts else None


class FakeProfileRepository:
    def __init__(
        self, calls: list[str], owner_account_id: UUID, *, fail_tutor_create: bool = False
    ) -> None:
        self.students: dict[UUID, StudentProfile] = {}
        self.tutors: dict[UUID, TutorProfile] = {}
        self.calls = calls
        self.fail_tutor_create = fail_tutor_create
        self.owner_account_id = owner_account_id

    async def create_student(self, display_name: str) -> tuple[StudentProfile, bool]:
        self.calls.append("student-create")
        account_id = self.owner_account_id
        existing = self.students.get(account_id)
        if existing is not None:
            return existing, False
        now = datetime.now(UTC)
        profile = StudentProfile(account_id, display_name, now, now)
        self.students[account_id] = profile
        return profile, True

    async def get_student(self, *, for_update: bool = False) -> StudentProfile | None:
        del for_update
        self.calls.append("student-read")
        return self.students.get(self.owner_account_id)

    async def update_student(self, display_name: str) -> StudentProfile | None:
        self.calls.append("student-update")
        account_id = self.owner_account_id
        existing = self.students.get(account_id)
        if existing is None or existing.display_name == display_name:
            return existing
        updated = StudentProfile(account_id, display_name, existing.created_at, datetime.now(UTC))
        self.students[account_id] = updated
        return updated

    async def create_tutor(
        self,
        display_name: str,
        *,
        correlation_id: UUID | None,
        request_id: str | None,
    ) -> tuple[TutorProfile, bool]:
        del correlation_id, request_id
        self.calls.append("tutor-create")
        account_id = self.owner_account_id
        existing = self.tutors.get(account_id)
        if existing is not None:
            return existing, False
        now = datetime.now(UTC)
        profile = TutorProfile(account_id, display_name, now, now)
        self.tutors[account_id] = profile
        if self.fail_tutor_create:
            raise AuditUnavailableError()
        return profile, True

    async def get_tutor(self, *, for_update: bool = False) -> TutorProfile | None:
        del for_update
        self.calls.append("tutor-read")
        return self.tutors.get(self.owner_account_id)

    async def update_tutor(self, display_name: str) -> TutorProfile | None:
        self.calls.append("tutor-update")
        account_id = self.owner_account_id
        existing = self.tutors.get(account_id)
        if existing is None or existing.display_name == display_name:
            return existing
        updated = TutorProfile(account_id, display_name, existing.created_at, datetime.now(UTC))
        self.tutors[account_id] = updated
        return updated


class FakeAuditRepository:
    def __init__(self, events: list[object], *, fail: bool = False) -> None:
        self.events = events
        self.fail = fail

    async def append(self, event: object) -> object:
        if self.fail:
            raise AuditUnavailableError()
        self.events.append(event)
        return event


class FakeUnitOfWork:
    def __init__(
        self,
        profiles: FakeProfileRepository,
        capabilities: FakeCapabilityRepository,
        audit: FakeAuditRepository,
        session_principal: Principal,
    ) -> None:
        self.profiles = profiles
        self.capability_grants = capabilities
        self.audit_events = audit
        self.session_principal = session_principal
        self._student_snapshot: dict[UUID, StudentProfile] = {}
        self._tutor_snapshot: dict[UUID, TutorProfile] = {}

    async def __aenter__(self) -> FakeUnitOfWork:
        self._student_snapshot = dict(self.profiles.students)
        self._tutor_snapshot = dict(self.profiles.tutors)
        return self

    async def __aexit__(self, exc_type: object, *_args: object) -> bool:
        if exc_type is not None:
            self.profiles.students = self._student_snapshot
            self.profiles.tutors = self._tutor_snapshot
        return False


def credential() -> SessionCredential:
    return SessionCredential.from_token("unit-test-session")


def service(
    bound_principal: Principal,
    *,
    active_accounts: set[UUID] | None = None,
    audit_failure: bool = False,
) -> tuple[ProfileService, FakeProfileRepository, FakeAuditRepository, list[str]]:
    calls: list[str] = []
    profiles = FakeProfileRepository(
        calls, bound_principal.account_id, fail_tutor_create=audit_failure
    )
    capabilities = FakeCapabilityRepository(active_accounts or set(), calls)
    audit = FakeAuditRepository([], fail=audit_failure)
    return (
        ProfileService(
            lambda _credential: cast(
                Any, FakeUnitOfWork(profiles, capabilities, audit, bound_principal)
            )
        ),
        profiles,
        audit,
        calls,
    )


def test_display_name_normalization_is_nfc_bounded_and_rejects_controls() -> None:
    assert normalize_display_name("  Jose\u0301\u2003 Smith  ") == "José Smith"
    assert len(normalize_display_name("x" * 80)) == 80
    for invalid in ("", "   ", "x" * 81, "name\twith-tab", "name\u200bhidden"):
        with pytest.raises(ProfileValidationError):
            normalize_display_name(invalid)
    with pytest.raises(ProfileValidationError):
        normalize_display_name(cast(str, 123))


@pytest.mark.asyncio
async def test_student_lifecycle_requires_principal_and_is_normalized_idempotent() -> None:
    subject = principal()
    profiles_service, profiles, _, _ = service(subject)
    with pytest.raises(AuthenticationRequiredError):
        await profiles_service.create_student_profile(None, credential(), "Student")

    created = await profiles_service.create_student_profile(
        subject, credential(), "  Student   Name "
    )
    repeated = await profiles_service.create_student_profile(subject, credential(), "Student Name")
    assert created == repeated
    assert len(profiles.students) == 1
    with pytest.raises(ProfileAlreadyExistsError):
        await profiles_service.create_student_profile(subject, credential(), "Different")

    unchanged = await profiles_service.update_student_profile(
        subject, credential(), " Student Name "
    )
    assert unchanged.updated_at == created.updated_at
    updated = await profiles_service.update_student_profile(subject, credential(), "Updated")
    assert updated.display_name == "Updated"
    assert await profiles_service.read_student_profile(subject, credential()) == updated


@pytest.mark.asyncio
async def test_missing_profiles_are_explicit() -> None:
    subject = principal()
    profiles_service, _, _, _ = service(subject, active_accounts={subject.account_id})
    with pytest.raises(ProfileNotFoundError):
        await profiles_service.read_student_profile(subject, credential())
    with pytest.raises(ProfileNotFoundError):
        await profiles_service.update_tutor_profile(subject, credential(), "Tutor")


@pytest.mark.asyncio
async def test_tutor_lifecycle_requires_grant_before_profile_and_is_idempotent() -> None:
    subject = principal()
    profiles_service, profiles, audit, calls = service(
        subject, active_accounts={subject.account_id}
    )
    created = await profiles_service.create_tutor_profile(subject, credential(), " Tutor   Name ")
    repeated = await profiles_service.create_tutor_profile(subject, credential(), "Tutor Name")

    assert created == repeated
    assert len(profiles.tutors) == 1
    assert audit.events == []
    assert calls[:2] == ["grant-lock", "tutor-create"]


@pytest.mark.asyncio
async def test_profile_row_never_grants_tutor_authority() -> None:
    subject = principal()
    profiles_service, profiles, _, calls = service(subject)
    now = datetime.now(UTC)
    profiles.tutors[subject.account_id] = TutorProfile(subject.account_id, "Existing", now, now)

    for operation in (
        profiles_service.read_tutor_profile(subject, credential()),
        profiles_service.update_tutor_profile(subject, credential(), "Changed"),
        profiles_service.create_tutor_profile(subject, credential(), "Existing"),
    ):
        with pytest.raises(CapabilityRequiredError):
            await operation
    assert profiles.tutors[subject.account_id].display_name == "Existing"
    assert calls == ["grant-lock", "grant-lock", "grant-lock"]


@pytest.mark.asyncio
async def test_tutor_create_rolls_back_when_audit_is_unavailable() -> None:
    subject = principal()
    profiles_service, profiles, _, _ = service(
        subject, active_accounts={subject.account_id}, audit_failure=True
    )
    with pytest.raises(AuditUnavailableError):
        await profiles_service.create_tutor_profile(subject, credential(), "Tutor")
    assert subject.account_id not in profiles.tutors
