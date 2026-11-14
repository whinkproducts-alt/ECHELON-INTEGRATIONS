"""How an ECHELON status maps onto Marcus's own task status."""

DEAD_HANDOFF = ("failed", "cancelled", "rejected")

_MAP = {
    "received": "handed_off",
    "routed": "handed_off",
    "in_progress": "handed_off",
    "paused": "handed_off",
    "frozen": "handed_off",  # ECHELON holds it; Marcus's own freeze is tracked separately
    "reconfirmation_required": "awaiting_confirmation",
    "blocked": "blocked",
    "done": "done",
    "failed": "failed",
    "rejected": "failed",
    "cancelled": "cancelled",
}


def task_status_for(echelon_status: str) -> str:
    return _MAP.get(echelon_status, "handed_off")
