"""Pure, unit-testable driver candidate scoring and selection."""
from ..services.geo import road_distance_km

def score_driver(driver: dict, pickup: tuple[float, float]) -> tuple[float, int, int]:
    distance = road_distance_km((float(driver["lat"]), float(driver["lng"])), pickup)
    return (distance, int(driver.get("active_orders", 0)), int(driver.get("completed_count", 0)))

def choose_driver(drivers: list[dict], pickup: tuple[float, float], vehicle_type: str = "any", express: bool = False) -> dict | None:
    candidates = [d for d in drivers if d.get("status") == "idle" and (vehicle_type == "any" or d.get("vehicle_type") == vehicle_type)]
    if not candidates:
        return None
    # Express chooses the nearest eligible driver; standard uses workload as tie-breaker.
    return min(candidates, key=lambda d: (score_driver(d, pickup)[0],) if express else score_driver(d, pickup))
