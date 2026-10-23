"""Single source of truth for legal order lifecycle transitions."""
TRANSITIONS = {
    "pending": {"assigned", "cancelled", "failed"},
    "assigned": {"driver_en_route", "pending", "cancelled", "failed"},
    "driver_en_route": {"arrived_at_pickup", "pending", "cancelled", "failed"},
    "arrived_at_pickup": {"pickup_verified", "cancelled", "failed"},
    "pickup_verified": {"in_transit", "failed"},
    "in_transit": {"arrived_at_dropoff", "failed"},
    "arrived_at_dropoff": {"delivered", "failed"},
    "delivered": set(), "cancelled": set(), "failed": set(),
}
class InvalidTransition(ValueError):
    """Raised when a requested order state transition is not allowed."""
def validate_transition(current: str, target: str) -> None:
    if target not in TRANSITIONS.get(current, set()):
        raise InvalidTransition(f"Cannot transition order from '{current}' to '{target}'.")
