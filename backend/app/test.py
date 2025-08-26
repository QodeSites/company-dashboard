# test_route.py
from fastapi import FastAPI, UploadFile, File, Form

app = FastAPI()

@app.post("/api/upload/equity-holding/")
async def test_equity_holding(
    file: UploadFile = File(...),
    qcode: str = Form(...)
):
    return {"message": "Route working", "filename": file.filename, "qcode": qcode}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8081)