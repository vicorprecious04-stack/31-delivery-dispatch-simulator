"""Validated API request models."""
from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from .services.geo import in_city_bounds
Vehicle = Literal["any", "bike", "car", "van"]
Priority = Literal["standard", "express"]
class Coordinates(BaseModel):
    lat: float
    lng: float
    @model_validator(mode="after")
    def bounds(self):
        if not in_city_bounds(self.lat, self.lng): raise ValueError("Coordinates must be within the Port Harcourt service area.")
        return self
class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=60)
    package_description: str = Field(min_length=1, max_length=200)
    pickup_name: str = Field(min_length=2, max_length=100)
    pickup_lat: float
    pickup_lng: float
    dropoff_name: str = Field(min_length=2, max_length=100)
    dropoff_lat: float
    dropoff_lng: float
    expected_at: datetime
    vehicle_preference: Vehicle = "any"
    priority: Priority = "standard"
    fragile: bool = False
    contactless: bool = False
    notes: str = Field(default="", max_length=500)
    user_name: str = Field(default="Dispatcher", min_length=1, max_length=60)
    @field_validator("expected_at")
    @classmethod
    def future_date(cls, value):
        if value.tzinfo is None: value = value.replace(tzinfo=timezone.utc)
        if value <= datetime.now(timezone.utc): raise ValueError("Expected delivery time must be in the future.")
        return value.astimezone(timezone.utc)
    @model_validator(mode="after")
    def valid_locations(self):
        if not in_city_bounds(self.pickup_lat, self.pickup_lng) or not in_city_bounds(self.dropoff_lat, self.dropoff_lng):
            raise ValueError("Pickup and drop-off must be within the Port Harcourt service area.")
        if abs(self.pickup_lat-self.dropoff_lat) < 0.00001 and abs(self.pickup_lng-self.dropoff_lng) < 0.00001:
            raise ValueError("Pickup and drop-off locations must differ.")
        return self
class CodeInput(BaseModel):
    code: str = Field(min_length=1, max_length=12)
class SpeedInput(BaseModel):
    multiplier: Literal[1, 2, 5, 10]
