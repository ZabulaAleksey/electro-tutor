from __future__ import annotations

from electro_tutor_api.application.capabilities import CapabilityGrantService
from electro_tutor_api.config import ProvisioningSettings
from electro_tutor_api.domain.capability import (
    AuthorityActor,
    CapabilityGrant,
    IssueCapabilityCommand,
    RevokeCapabilityCommand,
    TrustedAuthorityService,
)


class TrustedProvisioningAdapter:
    """Internal-only composition boundary; intentionally not mounted in FastAPI."""

    def __init__(
        self,
        settings: ProvisioningSettings,
        service: CapabilityGrantService,
    ) -> None:
        trusted_service = TrustedAuthorityService(settings.authority_actor_id)
        self._actor = AuthorityActor.from_trusted_service(trusted_service)
        self._service = service

    async def issue(self, command: IssueCapabilityCommand) -> CapabilityGrant:
        return await self._service.issue(command, self._actor)

    async def revoke(self, command: RevokeCapabilityCommand) -> CapabilityGrant:
        return await self._service.revoke(command, self._actor)
