"""Operator-owned usage exemptions, bound to authenticated internal account IDs.

This does not grant access to other accounts or override execution safety limits.
Removing an ID restores normal quotas without rewriting billing or usage history.
"""

from uuid import UUID

from ngertiin.config import get_settings


def unlimited_usage(owner: UUID | None) -> bool:
    return owner is not None and owner in get_settings().unlimited_account_ids
