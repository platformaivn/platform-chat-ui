from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

app = FastAPI()

# Đăng ký thư mục static để phục vụ các tệp tĩnh
app.mount("/cdn/16/", StaticFiles(directory="./"), name="static")

# Cấu hình Jinja2Templates
templates = Jinja2Templates(directory="./")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("./index.html", {"request": request})

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)