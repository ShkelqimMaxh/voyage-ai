from fastapi import APIRouter

from app.models.schemas import RoutePrefetchRequest, RoutePrefetchResponse
from app.services.prefetch import prefetch_route

router = APIRouter(prefix="/v1/prefetch", tags=["prefetch"])


@router.post("/route", response_model=RoutePrefetchResponse)
async def route(request: RoutePrefetchRequest) -> RoutePrefetchResponse:
    request.locale = "en"
    return await prefetch_route(request)
