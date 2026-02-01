# ToolHub（多工具集成站）- 重构版

## 结构
- `app/`：后端（FastAPI），按工具拆分模块
- `web/`：前端静态站点（工具大厅 + 各工具页面）
- `web/tools/packing/`：装箱工具前端
- `app/tools/packing/`：装箱工具后端业务/算法
- `app/routers/packing.py`：装箱工具 API 路由（前缀：`/api/v1/tools/packing`）

## 运行
```bash
pip install -r requirements.txt
python main.py
```

打开：
- 工具大厅：`http://127.0.0.1:8000/`
- 装箱工具：`http://127.0.0.1:8000/tools/packing/index.html`

API：
- `POST /api/v1/tools/packing/calculate`
