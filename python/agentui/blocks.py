"""Block builders — turn plain data into wire-format UI blocks.

Everything here is pure and defensive: payload strings are clipped, lists are
bounded, and unknown components never pass through. The wire shape of each
component matches spec/schemas/*.schema.json.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from agentui.protocol import COMPONENT_CATALOG, UI_PROTOCOL_VERSION

# Caps mirror the schemas; producers should enforce them so consumers only
# need defensive copies.
_MAX_ITEMS = 14
_MAX_ROWS = 24
_MAX_COLUMNS = 8
_MAX_CELL_CHARS = 120
_MAX_TITLE_CHARS = 60
_MAX_TIMELINE_ITEMS = 14
_MAX_DIMENSIONS = 10
_MAX_CALENDAR_DAYS = 7
_MAX_SERIES = 3
_MAX_CHART_POINTS = 14
_MAX_FILE_CHARS = 20000

_DATE_RE = re.compile(r"^\d{4}(-\d{1,2}(-\d{1,2})?)?$")
_FILENAME_RE = re.compile(r"^[\w.-]{1,80}$")


@dataclass(frozen=True)
class UiBlock:
    """A renderable block: catalog component + pre-clipped payload."""

    component: str
    title: str = ""
    payload: dict[str, Any] = field(default_factory=dict)

    def to_wire(self) -> dict[str, Any]:
        wire: dict[str, Any] = {"component": self.component}
        if self.title:
            wire["title"] = self.title
        wire.update(self.payload)
        return wire


def _clip(value: Any, limit: int = _MAX_CELL_CHARS) -> str:
    """Cell text-ify + clip. None/empty → "" (consumers render as —)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (int, float)):
        return str(value)
    text = _join(value) if isinstance(value, (dict, list)) else str(value).strip()
    if len(text) > limit:
        return text[:limit].rstrip() + "…"
    return text


def _join(value: Any) -> str:
    """Flatten nested structures into one readable line."""
    if isinstance(value, list):
        return "、".join(_clip(item, 40) for item in value if item not in (None, ""))
    if isinstance(value, dict):
        return "；".join(
            f"{key}: {_clip(item, 40)}"
            for key, item in value.items()
            if item not in (None, "", [], {})
        )
    return str(value)


def _title(block_title: str) -> str:
    return _clip(block_title, _MAX_TITLE_CHARS)


# ── builders ────────────────────────────────────────────────────────────


def keyvalue(items: list[tuple[str, Any]] | dict[str, Any], *, title: str = "") -> dict[str, Any]:
    """Scalar pairs → keyvalue block. Accepts [(label, value)] or a mapping."""
    if isinstance(items, dict):
        pairs = list(items.items())
    else:
        pairs = items
    clipped = [
        {"label": _clip(label), "value": _clip(value)}
        for label, value in pairs[:_MAX_ITEMS]
        if _clip(label)
    ]
    if not clipped:
        raise ValueError("keyvalue needs at least one labeled item")
    block: dict[str, Any] = {"component": "keyvalue", "items": clipped}
    if _title(title):
        block["title"] = _title(title)
    return block


def table(columns: list[str], rows: list[list[Any]], *, title: str = "") -> dict[str, Any]:
    cols = [_clip(c) for c in columns[:_MAX_COLUMNS]]
    if len(cols) < 2:
        raise ValueError("table needs at least 2 columns")
    width = len(columns[:_MAX_COLUMNS])
    clipped_rows = [
        [
            _clip(row[i] if isinstance(row, (list, tuple)) and i < len(row) else None)
            for i in range(width)
        ]
        for row in rows[:_MAX_ROWS]
    ]
    if not clipped_rows:
        raise ValueError("table needs at least one row")
    block: dict[str, Any] = {"component": "table", "columns": cols, "rows": clipped_rows}
    if _title(title):
        block["title"] = _title(title)
    return block


def timeline(
    items: list[dict[str, Any]], *, title: str = "", now: str = ""
) -> dict[str, Any]:
    """Ordered periods → timeline block. ``start`` accepts ISO dates or years."""
    cleaned: list[dict[str, str]] = []
    for item in items[:_MAX_TIMELINE_ITEMS]:
        if not isinstance(item, dict):
            continue
        start = _axis(item.get("start"))
        if start is None:
            continue
        entry: dict[str, str] = {"start": start}
        end = _axis(item.get("end"))
        if end:
            entry["end"] = end
        label = _clip(item.get("title"), 40)
        if label:
            entry["title"] = label
        note = _clip(item.get("note"), 60)
        if note:
            entry["note"] = note
        cleaned.append(entry)
    if len(cleaned) < 2:
        raise ValueError("timeline needs at least two dated items")
    block: dict[str, Any] = {"component": "timeline", "items": sorted(cleaned, key=lambda e: e["start"])}
    if _title(title):
        block["title"] = _title(title)
    if now:
        block["now"] = _clip(now, 20)
    return block


def _axis(value: Any) -> str | None:
    """Timeline axis value: ISO date (year/month precision ok) or bare year."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)) and 1000 <= float(value) <= 3000:
        return str(int(value))
    text = str(value).strip()
    if _DATE_RE.match(text):
        return text[:10]
    matched = re.match(r"^(1[89]\d{2}|20\d{2})", text)
    return matched.group(1) if matched else None


def compare(
    dimensions: list[dict[str, Any]],
    *,
    title: str = "",
    labels: dict[str, str] | None = None,
    overall_score: float | None = None,
    tier: str = "",
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for record in dimensions[:_MAX_DIMENSIONS]:
        if not isinstance(record, dict):
            continue
        label = _clip(record.get("label") or record.get("name"), 40)
        score = record.get("score")
        if not label or isinstance(score, bool) or not isinstance(score, (int, float)):
            continue
        row: dict[str, Any] = {"label": label, "score": _score(score)}
        summary = _clip(record.get("summary"), 80)
        if summary:
            row["summary"] = summary
        evidence = record.get("evidence") if isinstance(record.get("evidence"), dict) else {}
        side_a = _clip(evidence.get("personA"), 30)
        side_b = _clip(evidence.get("personB"), 30)
        if side_a or side_b:
            row["personA"] = side_a
            row["personB"] = side_b
        rows.append(row)
    if not rows:
        raise ValueError("compare needs at least one scored dimension")
    block: dict[str, Any] = {"component": "compare", "dimensions": rows}
    if labels:
        block["labels"] = {
            side: _clip(labels.get(side), 25)
            for side in ("personA", "personB")
            if labels.get(side)
        }
    if overall_score is not None and not isinstance(overall_score, bool):
        block["overallScore"] = _score(overall_score)
    if _clip(tier, 20):
        block["tier"] = _clip(tier, 20)
    if _title(title):
        block["title"] = _title(title)
    return block


def _score(value: float) -> float:
    return round(max(0.0, min(100.0, float(value))), 1)


def download(
    *,
    filename: str,
    file_text: str,
    button_label: str,
    title: str = "",
    mime_type: str = "text/plain",
    preview: str = "",
    header: str = "",
) -> dict[str, Any]:
    """Client-side file export. The consumer materializes the file locally
    from ``file_text`` via a Blob — it must never fetch URLs from a block."""
    safe_name = _clip(filename, 80)
    if not _FILENAME_RE.match(safe_name):
        raise ValueError(f"filename must match {_FILENAME_RE.pattern}")
    if not file_text.strip():
        raise ValueError("download needs non-empty fileText")
    block: dict[str, Any] = {
        "component": "download",
        "filename": safe_name,
        "fileText": file_text[:_MAX_FILE_CHARS],
        "buttonLabel": _clip(button_label, 30) or "Download",
        "mimeType": _clip(mime_type, 60),
    }
    if _title(title):
        block["title"] = _title(title)
    if _clip(preview, 160):
        block["preview"] = _clip(preview, 160)
    if _clip(header, 120):
        block["header"] = _clip(header, 120)
    return block


def chart(
    series: list[dict[str, Any]],
    *,
    chart_type: str = "line",
    title: str = "",
    y_min: float | None = None,
    y_max: float | None = None,
    note: str = "",
) -> dict[str, Any]:
    """Line or bar chart data (consumers draw the SVG, no chart libraries)."""
    if chart_type not in ("line", "bar"):
        raise ValueError("chartType must be line or bar")
    cleaned: list[dict[str, Any]] = []
    for entry in series[:_MAX_SERIES]:
        if not isinstance(entry, dict):
            continue
        points = [_chart_point(p) for p in (entry.get("points") or [])[:_MAX_CHART_POINTS]]
        points = [p for p in points if p is not None]
        if len(points) < 2:
            continue
        item: dict[str, Any] = {
            "topic": _clip(entry.get("topic") or entry.get("label") or "series", 64),
            "label": _clip(entry.get("label"), 40),
            "points": points,
        }
        if entry.get("reverse") is True:
            item["reverse"] = True
        cleaned.append(item)
    if not cleaned:
        raise ValueError("chart needs at least one series with ≥2 points")
    block: dict[str, Any] = {"component": "chart", "chartType": chart_type, "series": cleaned}
    if y_min is not None:
        block["yMin"] = float(y_min)
    if y_max is not None:
        block["yMax"] = float(y_max)
    if _clip(note, 200):
        block["note"] = _clip(note, 200)
    if _title(title):
        block["title"] = _title(title)
    return block


def _chart_point(point: Any) -> dict[str, Any] | None:
    if not isinstance(point, dict):
        return None
    if point.get("y") is not None and not isinstance(point.get("y"), bool):
        return {"x": _clip(point.get("x"), 12), "y": float(point["y"])}
    if point.get("value") is not None and not isinstance(point.get("value"), bool):
        return {"label": _clip(point.get("label"), 20), "value": float(point["value"])}
    return None


def calendar(days: list[dict[str, Any]], *, title: str = "", labels: dict[str, str] | None = None) -> dict[str, Any]:
    """Day cards (almanac / date output). Keys yi/ji/ganZhi are domain names,
    ``labels`` localizes the rendered tags."""
    cleaned: list[dict[str, str]] = []
    for day in days[:_MAX_CALENDAR_DAYS]:
        if not isinstance(day, dict):
            continue
        date = _clip(day.get("date"), 12)
        if not date:
            continue
        entry: dict[str, str] = {"date": date}
        for source in ("ganZhi", "yi", "ji"):
            value = _clip(day.get(source), 60)
            if value:
                entry[source] = value
        cleaned.append(entry)
    if not cleaned:
        raise ValueError("calendar needs at least one dated day")
    block: dict[str, Any] = {"component": "calendar", "days": cleaned}
    if labels:
        block["labels"] = {
            key: _clip(labels.get(key), 10) for key in ("yi", "ji", "ganZhi") if labels.get(key)
        }
    if _title(title):
        block["title"] = _title(title)
    return block


def form(fields: list[dict[str, Any]], *, title: str = "", steps: int = 1, submit_label: str = "") -> dict[str, Any]:
    """Structured input. Field contract is producer-authoritative; the consumer
    renders + gives instant feedback, the producer re-validates on submit."""
    cleaned: list[dict[str, Any]] = []
    for spec in fields[:_MAX_ITEMS]:
        if not isinstance(spec, dict) or not spec.get("name"):
            continue
        field_spec: dict[str, Any] = {
            "name": _clip(spec["name"], 64),
            "label": _clip(spec.get("label"), 121),
            "type": spec.get("type") if spec.get("type") in ("text", "date", "time", "number", "select") else "text",
            "required": bool(spec.get("required")),
        }
        if spec.get("step"):
            field_spec["step"] = max(1, int(spec["step"]))
        if spec.get("hint"):
            field_spec["hint"] = _clip(spec["hint"], 121)
        if spec.get("options"):
            field_spec["options"] = [
                {"value": _clip(o.get("value"), 64), "label": _clip(o.get("label"), 64)}
                for o in spec["options"]
                if isinstance(o, dict) and o.get("value")
            ]
        for key in ("min", "max"):
            if isinstance(spec.get(key), (int, float)) and not isinstance(spec.get(key), bool):
                field_spec[key] = spec[key]
        if isinstance(spec.get("maxLength"), int):
            field_spec["maxLength"] = max(1, min(200, spec["maxLength"]))
        if spec.get("pattern"):
            field_spec["pattern"] = _clip(spec["pattern"], 200)
        cleaned.append(field_spec)
    if not cleaned:
        raise ValueError("form needs at least one field")
    block: dict[str, Any] = {"component": "form", "fields": cleaned, "steps": max(1, min(5, steps))}
    if _clip(submit_label, 30):
        block["submitLabel"] = _clip(submit_label, 30)
    if _title(title):
        block["title"] = _title(title)
    return block


def ui_event(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Blocks → wire event payload (what rides inside an SSE ``UI`` event)."""
    return {"uiVersion": UI_PROTOCOL_VERSION, "blocks": list(blocks[:5])}


__all__ = [
    "UiBlock",
    "calendar",
    "chart",
    "compare",
    "download",
    "form",
    "keyvalue",
    "table",
    "timeline",
    "ui_event",
]
