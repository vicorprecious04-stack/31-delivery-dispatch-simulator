"""Geographic calculations for approximate city delivery distances and ETAs."""
from math import asin, cos, radians, sin, sqrt
from ..config import ROAD_FACTOR, AVERAGE_SPEED_KMH

CITY_CENTER = (4.8156, 7.0498)
CITY_BOUNDS = (4.65, 4.98, 6.85, 7.25)  # min lat, max lat, min lng, max lng

def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Return great-circle distance in kilometres for (lat, lng) pairs."""
    lat1, lon1, lat2, lon2 = map(radians, (a[0], a[1], b[0], b[1]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(min(1.0, h)))

def road_distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Estimate road distance by applying a documented 1.3x road factor."""
    return haversine_km(a, b) * ROAD_FACTOR

def eta_minutes(distance_km: float) -> int:
    """Estimate city ETA from configurable average speed, rounded up to minutes."""
    return max(1, int((distance_km / AVERAGE_SPEED_KMH) * 60 + 0.999))

def in_city_bounds(lat: float, lng: float) -> bool:
    min_lat, max_lat, min_lng, max_lng = CITY_BOUNDS
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng
