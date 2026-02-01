from pydantic import BaseModel
from typing import List

class ItemModel(BaseModel):
    name: str
    w: int
    h: int
    d: int
    count: int
    # color 字段已删除

class PackingRequest(BaseModel):
    bin_size: List[int]
    items: List[ItemModel]