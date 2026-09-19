"""AgentUI Python builders + validation tests (pure, zero deps)."""

from __future__ import annotations

import json

import pytest

from agentui import (
    COMPONENT_CATALOG,
    UI_PROTOCOL_VERSION,
    calendar,
    chart,
    compare,
    download,
    form,
    is_valid,
    keyvalue,
    table,
    timeline,
    ui_event,
    validate,
)


# ── builders produce schema-valid wire blocks ───────────────────────────


def test_every_builder_output_passes_validation() -> None:
    blocks = [
        keyvalue([("engine", "iztro"), ("gender", "male")], title="盘面"),
        table(["宫位", "主星"], [["官禄", "太阳"], ["迁移", "天机"]]),
        form([{"name": "birthDate", "label": "生日", "type": "date", "required": True}]),
        timeline([
            {"start": "1990-01-01", "end": "2007-03-01", "title": "A"},
            {"start": "2007-03-01", "end": "2034-03-01", "title": "B"},
        ], now="2026-09-16"),
        compare([{"label": "日主", "score": 72, "personA": "丙", "personB": "壬"}],
                overall_score=78, tier="良好"),
        download(filename="report_20260919.txt", file_text="hello", button_label="下载"),
        chart([{"topic": "sleep", "label": "睡眠", "points": [
            {"x": "09-12", "y": 70}, {"x": "09-18", "y": 35}]}], y_min=0, y_max=100),
        calendar([{"date": "2026-09-19", "ganZhi": "丙寅", "yi": "出行", "ji": "动土"}]),
    ]
    assert {b["component"] for b in blocks} == COMPONENT_CATALOG
    for block in blocks:
        assert not validate(block), (block["component"], validate(block))
        json.dumps(block, ensure_ascii=False)  # wire-safe


def test_keyvalue_accepts_mapping_and_clips() -> None:
    block = keyvalue({"engine": "x" * 500})
    assert len(block["items"][0]["value"]) == 121
    assert block["items"][0]["value"].endswith("…")


def test_keyvalue_rejects_empty() -> None:
    with pytest.raises(ValueError):
        keyvalue([])


def test_table_clips_rows_and_columns() -> None:
    rows = [[f"r{i}", "v"] for i in range(100)]
    block = table(["a", "b"], rows)
    assert len(block["rows"]) == 24
    with pytest.raises(ValueError):
        table(["only"], [["v"]])


def test_timeline_sorts_and_rejects_score_axis() -> None:
    block = timeline([
        {"start": "2007-03-01", "title": "B"},
        {"start": "1990-01-01", "title": "A"},
    ])
    assert [item["start"] for item in block["items"]] == ["1990-01-01", "2007-03-01"]
    # 0–100 numbers are not years — a score must never become an axis.
    with pytest.raises(ValueError):
        timeline([{"start": 72}, {"start": 99}])


def test_compare_clamps_scores() -> None:
    block = compare([{"label": "x", "score": 137}, {"label": "y", "score": -8}])
    assert [row["score"] for row in block["dimensions"]] == [100.0, 0.0]


def test_compare_requires_scored_dimensions() -> None:
    with pytest.raises(ValueError):
        compare([{"label": "x", "summary": "no score"}])


def test_download_rejects_unsafe_filename() -> None:
    with pytest.raises(ValueError):
        download(filename="../../etc/passwd", file_text="x", button_label="d")
    with pytest.raises(ValueError):
        download(filename="ok.txt", file_text="  ", button_label="d")


def test_chart_rejects_unknown_type_and_short_series() -> None:
    with pytest.raises(ValueError):
        chart([{"points": [{"x": "a", "y": 1}, {"x": "b", "y": 2}]}], chart_type="pie")
    with pytest.raises(ValueError):
        chart([{"topic": "s", "points": [{"x": "a", "y": 1}]}])


def test_form_normalizes_unknown_type_to_text() -> None:
    block = form([{"name": "q", "label": "Q", "type": "color", "required": False}])
    assert block["fields"][0]["type"] == "text"


def test_ui_event_carries_version_and_caps_blocks() -> None:
    blocks = [keyvalue([("a", "1")])] * 10
    event = ui_event(blocks)
    assert event["uiVersion"] == UI_PROTOCOL_VERSION
    assert len(event["blocks"]) == 5


# ── validation rejects malformed blocks ─────────────────────────────────


def test_unknown_component_rejected() -> None:
    assert validate({"component": "iframe", "src": "https://evil"}) != []
    assert validate("not an object") != []
    assert validate({}) != []


def test_structured_junk_rejected_per_component() -> None:
    assert not is_valid({"component": "keyvalue"})  # missing items
    assert not is_valid({"component": "table", "columns": ["a"], "rows": []})
    assert not is_valid({"component": "timeline", "items": [{"start": "1990"}]})
    assert not is_valid({"component": "compare", "dimensions": [{"label": "x"}]})
    assert not is_valid({"component": "download"})
    assert not is_valid({"component": "chart", "chartType": "line", "series": []})
    assert not is_valid({"component": "calendar", "days": [{}]})


def test_title_length_enforced() -> None:
    # Builders clip titles; validation must still reject unclipped input
    # from producers that bypass the builders.
    raw = {"component": "keyvalue", "title": "t" * 200,
           "items": [{"label": "a", "value": "1"}]}
    assert validate(raw) != []
    assert is_valid(keyvalue([("a", "1")], title="t" * 200))  # builder clips
