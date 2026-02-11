from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from app.tools.packing.schemas import PackingRequestV2
from app.tools.packing.service import run_packing
from app.services.tool_charge import require_and_charge

router = APIRouter(prefix="/api/v1/tools/packing", tags=["tools:packing"])

@router.post("/calculate")
async def calculate(request: PackingRequestV2, _: bool = Depends(require_and_charge("packing"))):
    try:
        packed_items, unpacked_stats = await run_in_threadpool(run_packing, request)
        return {
            "status": "success",
            "items": packed_items,
            "unpacked": unpacked_stats
        }
    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})
