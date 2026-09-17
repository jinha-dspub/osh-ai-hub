"""Shared /demo gateway. Register future demo routes here without nginx changes."""

from fastapi.responses import HTMLResponse

from app.copd_demo import app


@app.get("/demo")
def demo_slash():
    return demo_index()


@app.api_route("/demo/", methods=["GET", "HEAD"], response_class=HTMLResponse)
def demo_index():
    return """<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>OSH AI DEMO</title>
    <link rel="stylesheet" href="/demo/copd/assets/app.css"></head><body>
    <main class="container copd-page"><a href="https://osh.ai.kr/tools">OSH AI Hub · 분석·체험</a>
    <header class="copd-heading"><h1>AI DEMO</h1><p>자료를 탐색하고 AI 도구를 체험하세요.</p></header>
    <article class="tool-card"><span class="badge">실제 자료 · 내부 검토</span>
    <h2>COPD 산재 판정 사례</h2><p>원문·AI 라벨·노출 측정치를 함께 살펴봅니다.</p>
    <a class="button" href="/demo/copd/">COPD 검색 DEMO →</a></article></main></body></html>"""
