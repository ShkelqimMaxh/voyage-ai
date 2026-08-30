from fastapi import APIRouter

from app.models.schemas import PlaceResolveRequest, PlaceResolveResponse
from app.services.geocode import resolve_place

router = APIRouter(prefix="/v1/places", tags=["places"])


@router.post("/resolve", response_model=PlaceResolveResponse)
async def resolve(request: PlaceResolveRequest) -> PlaceResolveResponse:
    request.locale = "en"
    return await resolve_place(request.point, request.lookahead_seconds)
