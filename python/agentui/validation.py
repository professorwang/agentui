"""Validate wire blocks against the v1 catalog contracts.

Mirrors spec/schemas/*.schema.json without a JSON-Schema dependency — the
checks are small, explicit, and give actionable error messages. ``validate``
returns a list of problems (empty = valid); ``is_valid`` is the boolean form.
"""

from __future__ import annotations

from typing import Any

from agentui.protocol import COMPONENT_CATALOG

_MAX_TITLE = 61
_MAX_LABEL = 121


def validate(block: Any) -> list[str]:
    """Return all problems with a block (empty list = valid)."""
    problems: list[str] = []
    if not isinstance(block, dict):
        return ["block must be an object"]
    component = block.get("component")
    if component not in COMPONENT_CATALOG:
        problems.append(f"unknown component: {component!r} (not in catalog)")
        return problems
    title = block.get("title")
    if title is not None and (not isinstance(title, str) or len(title) > _MAX_TITLE):
        problems.append("title must be a string of ≤61 chars")
    problems.extend(_CHECKS[component](block))
    return problems


def is_valid(block: Any) -> bool:
    return not validate(block)


def _items(block: dict[str, Any]) -> list[Any]:
    value = block.get("items")
    return value if isinstance(value, list) else []


def _check_keyvalue(block: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    items = _items(block)
    if not items:
        return ["keyvalue needs a non-empty items array"]
    if len(items) > 14:
        problems.append("keyvalue allows ≤14 items")
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            problems.append(f"items[{index}] must be an object")
            continue
        for key in ("label", "value"):
            value = item.get(key)
            if not isinstance(value, str) or len(value) > _MAX_LABEL:
                problems.append(f"items[{index}].{key} must be a string of ≤121 chars")
    return problems


def _check_table(block: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    columns = block.get("columns")
    rows = block.get("rows")
    if not isinstance(columns, list) or not (2 <= len(columns) <= 8):
        problems.append("table needs 2–8 columns")
    if not isinstance(rows, list) or not rows:
        problems.append("table needs a non-empty rows array")
        return problems
    if len(rows) > 24:
        problems.append("table allows ≤24 rows")
    width = len(columns) if isinstance(columns, list) else 0
    for index, row in enumerate(rows):
        if not isinstance(row, list):
            problems.append(f"rows[{index}] must be an array")
    return problems


def _check_form(block: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    fields = block.get("fields")
    if not isinstance(fields, list) or not fields:
        return ["form needs a non-empty fields array"]
    if len(fields) > 12:
        problems.append("form allows ≤12 fields")
    for index, spec in enumerate(fields):
        if not isinstance(spec, dict):
            problems.append(f"fields[{index}] must be an object")
            continue
        for key in ("name", "label", "type", "required"):
            if key not in spec:
                problems.append(f"fields[{index}].{key} is required")
    return problems


def _check_timeline(block: dict[str, Any]) -> list[str]:
    items = _items(block)
    if len(items) < 2:
        return ["timeline needs ≥2 items"]
    if len(items) > 14:
        return ["timeline allows ≤14 items"]
    for index, item in enumerate(items):
        if not isinstance(item, dict) or not item.get("start"):
            return [f"items[{index}].start is required"]
    return []


def _check_compare(block: dict[str, Any]) -> list[str]:
    dimensions = block.get("dimensions")
    if not isinstance(dimensions, list) or not dimensions:
        return ["compare needs a non-empty dimensions array"]
    if len(dimensions) > 10:
        return ["compare allows ≤10 dimensions"]
    for index, row in enumerate(dimensions):
        if not isinstance(row, dict):
            return [f"dimensions[{index}] must be an object"]
        score = row.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool):
            return [f"dimensions[{index}].score must be a number"]
    return []


def _check_download(block: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    for key in ("filename", "fileText", "buttonLabel"):
        if not isinstance(block.get(key), str) or not block.get(key):
            problems.append(f"download.{key} is required")
    file_text = block.get("fileText")
    if isinstance(file_text, str) and len(file_text) > 20000:
        problems.append("download.fileText allows ≤20000 chars")
    return problems


def _check_chart(block: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if block.get("chartType") not in ("line", "bar"):
        problems.append("chart.chartType must be line or bar")
    series = block.get("series")
    if not isinstance(series, list) or not series:
        problems.append("chart needs a non-empty series array")
        return problems
    if len(series) > 3:
        problems.append("chart allows ≤3 series")
    for index, entry in enumerate(series):
        if not isinstance(entry, dict):
            problems.append(f"series[{index}] must be an object")
            continue
        points = entry.get("points")
        if not isinstance(points, list) or len(points) < 2:
            problems.append(f"series[{index}] needs ≥2 points")
    return problems


def _check_calendar(block: dict[str, Any]) -> list[str]:
    days = block.get("days")
    if not isinstance(days, list) or not days:
        return ["calendar needs a non-empty days array"]
    if len(days) > 7:
        return ["calendar allows ≤7 days"]
    for index, day in enumerate(days):
        if not isinstance(day, dict) or not day.get("date"):
            return [f"days[{index}].date is required"]
    return []


_CHECKS = {
    "keyvalue": _check_keyvalue,
    "table": _check_table,
    "form": _check_form,
    "timeline": _check_timeline,
    "compare": _check_compare,
    "download": _check_download,
    "chart": _check_chart,
    "calendar": _check_calendar,
}


__all__ = ["is_valid", "validate"]
