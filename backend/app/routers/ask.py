from fastapi import APIRouter

from app.models.schemas import AskRequest, AskResponse
from app.services.ask import answer_question

router = APIRouter(prefix="/v1/ask", tags=["ask"])


@router.post("", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    request.locale = "en"
    return await answer_question(request)
