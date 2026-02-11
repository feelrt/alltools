# 自动工具注册与发现
from typing import Dict

_TOOL_REGISTRY: Dict[str, dict] = {}

def tool(key: str, name: str, cost: int):
    def wrapper(func):
        _TOOL_REGISTRY[key] = {
            "tool_key": key,
            "tool_name": name,
            "cost": cost,
            "endpoint": func.__name__,
        }
        return func
    return wrapper

def get_registered_tools():
    return _TOOL_REGISTRY