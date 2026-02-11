from pydantic import BaseModel
from typing import List, Optional

class ItemModel(BaseModel):
    name: str
    w: int
    h: int
    d: int
    count: int

class PackingRequest(BaseModel):
    bin_size: List[int]
    items: List[ItemModel]

class PrefilledItemModel(BaseModel):
    """已固定的放置结果（用于“先填充”后继续计算）"""
    name: str
    pos: List[int]  # [x, z, y]，单位：mm
    dim: List[int]  # [w, h, d]，单位：mm

class PackingRequestV2(PackingRequest):
    """兼容新增字段：prefilled"""
    prefilled: List[PrefilledItemModel] = []
    # 计算阶段："prefill" 表示“先填充”，"auto"/None 表示总智能装箱
    # 先填充阶段会启用“尽量躺平/尽量低矮”的旋转偏好
    phase: Optional[str] = None
