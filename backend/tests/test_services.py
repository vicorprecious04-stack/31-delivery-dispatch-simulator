import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.geo import haversine_km, road_distance_km, in_city_bounds
from app.services.dispatch import choose_driver, score_driver
from app.services.state_machine import validate_transition, InvalidTransition

def test_haversine_distance_port_harcourt_landmarks():
    distance = haversine_km((4.8156, 7.0498), (4.8156, 7.0214))
    assert 3.0 < distance < 3.3
    assert road_distance_km((4.8156, 7.0498), (4.8156, 7.0214)) > distance

def test_city_bounds():
    assert in_city_bounds(4.8156, 7.0498)
    assert not in_city_bounds(5.5, 7.0498)

def test_dispatch_prefers_nearest_eligible_driver():
    drivers = [
        {"id": 1, "status": "idle", "vehicle_type": "bike", "lat": 4.90, "lng": 7.05, "active_orders": 0, "completed_count": 0},
        {"id": 2, "status": "idle", "vehicle_type": "car", "lat": 4.816, "lng": 7.05, "active_orders": 0, "completed_count": 2},
        {"id": 3, "status": "offline", "vehicle_type": "bike", "lat": 4.815, "lng": 7.05, "active_orders": 0, "completed_count": 0},
    ]
    assert choose_driver(drivers, (4.8156, 7.0498), "any")["id"] == 2
    assert choose_driver(drivers, (4.8156, 7.0498), "bike")["id"] == 1
    assert choose_driver(drivers, (4.8156, 7.0498), "van") is None

def test_dispatch_tie_breaks_on_workload():
    a = {"id": 1, "status": "idle", "vehicle_type": "bike", "lat": 4.8156, "lng": 7.0498, "active_orders": 1, "completed_count": 0}
    b = {**a, "id": 2, "active_orders": 0}
    assert choose_driver([a,b], (4.8156,7.0498))["id"] == 2

def test_state_machine_valid_and_invalid_transitions():
    validate_transition("pending", "assigned")
    validate_transition("arrived_at_pickup", "pickup_verified")
    try:
        validate_transition("delivered", "in_transit")
        assert False, "Expected invalid transition"
    except InvalidTransition:
        pass
