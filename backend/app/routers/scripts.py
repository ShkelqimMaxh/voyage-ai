from fastapi import APIRouter

from app.models.schemas import NarrationScript, ScriptRequest
from app.services.claude_scripts import generate_script

router = APIRouter(prefix="/v1/scripts", tags=["scripts"])


@router.post("/generate", response_model=NarrationScript)
async def generate(request: ScriptRequest) -> NarrationScript:
    request.locale = "en"
    return await generate_script(request)
