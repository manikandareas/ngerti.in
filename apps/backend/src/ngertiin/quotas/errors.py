"""Domain failures translated only at the HTTP boundary."""


class QuotaConflict(Exception):
    """An operation identity, state or reservation token no longer agrees."""


class QuotaNotFound(Exception):
    """An account does not own this operation."""


class QuotaExceeded(Exception):
    def __init__(self, meter: str, required: int, usage: dict, period: dict):
        self.meter = meter
        self.required = required
        self.usage = usage
        self.period = period
        super().__init__(f"Insufficient {meter} capacity")
