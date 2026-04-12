"""
[WHO]: FastAPI 后端，提供 /api/analyze 图片对比接口
[FROM]: analyzer.compare_images, config
[TO]: React 前端通过 HTTP 调用
[HERE]: 项目根目录，替代 Gradio 的 app.py 作为后端服务
"""
import os
import tempfile
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from analyzer import compare_images
from config import ANTHROPIC_BASE_URL

app = FastAPI(title="游戏美术效果对比工具 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/analyze")
async def analyze(
    art_image: UploadFile = File(...),
    game_image: UploadFile = File(...),
    api_key: str = Form(...),
    base_url: str = Form(default=""),
    thinking_budget: float = Form(default=0.18),
    canvas_width: int = Form(default=2100),
    canvas_height: int = Form(default=1080),
):
    if not api_key.strip():
        raise HTTPException(status_code=400, detail="请提供 API Key")

    tmp_dir = tempfile.mkdtemp()
    try:
        art_path = os.path.join(tmp_dir, art_image.filename or "art.png")
        game_path = os.path.join(tmp_dir, game_image.filename or "game.png")

        with open(art_path, "wb") as f:
            shutil.copyfileobj(art_image.file, f)
        with open(game_path, "wb") as f:
            shutil.copyfileobj(game_image.file, f)

        result = compare_images(
            art_path, game_path,
            api_key.strip(),
            base_url.strip() or None,
            thinking_budget,
            canvas_width, canvas_height,
        )
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# 生产模式：serve React 构建产物
dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(dist_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
