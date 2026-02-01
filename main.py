from app.api import create_app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    print("服务启动：")
    print(" - 工具大厅: http://127.0.0.1:8000/")
    print(" - 装箱工具: http://127.0.0.1:8000/tools/packing/index.html")
    uvicorn.run(app, host="0.0.0.0", port=8000)
