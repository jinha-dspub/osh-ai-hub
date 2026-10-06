"""Shared /demo gateway. Register future demo routes here without nginx changes."""

import json
from html import escape
from pathlib import Path

from fastapi.responses import HTMLResponse

from app.copd_demo import app
from app.corporate_ohs import register as register_corporate_ohs
from app.kosha_context import register as register_kosha_context
from app.kosha_graphrag import register as register_kosha_graphrag
from app.lanyard import register as register_lanyard
from app.oshmaster import register as register_oshmaster
from app.public_ohs_readiness import register as register_public_ohs_readiness
from app.safetybread_apps import register as register_safetybread_apps
from app.support_programs import register as register_support_programs
from app.voice import register

register(app)
register_oshmaster(app)
register_lanyard(app)
register_support_programs(app)
register_corporate_ohs(app)
register_public_ohs_readiness(app)
register_kosha_graphrag(app)
register_kosha_context(app)
register_safetybread_apps(app)


@app.get("/demo")
def demo_slash():
    return demo_index()


@app.api_route("/demo/", methods=["GET", "HEAD"], response_class=HTMLResponse)
@app.api_route("/demo/sanje/", methods=["GET", "HEAD"], response_class=HTMLResponse)
def demo_index():
    data = json.loads(
        (Path(__file__).resolve().parents[2] / "web/lib/sanje-catalog.json").read_text()
    )
    cards = "".join(
        f'<article class="tool-card"><span class="badge">실제 자료 · 내부 검토</span><h2>{escape(group["title"])}</h2><p>{group["cases"]:,}개 사례 · 연구자 윤진하 · 연세대학교 산업보건연구소</p><a class="button" href="/demo/sanje/{escape(group["id"])}/">검색 DEMO →</a></article>'
        for group in data["groups"]
    )
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>산재 판정사례 검색</title>
    <link rel="stylesheet" href="/demo/copd/assets/app.css"></head><body>
    <main class="container copd-page"><a href="https://osh.ai.kr/datasets/sanje">OSH AI Hub · 자료 소개</a>
    <header class="copd-heading"><h1>산재 판정사례 검색</h1><p>질환군을 선택해 원문·AI 라벨·측정치·근무시간을 살펴보세요.</p></header>
    <div class="tool-grid">{cards}</div></main></body></html>"""
