"""AgentUI — declarative UI blocks for agent responses.

Protocol constants, wire builders, and validation. Pair with the JS reference
renderer (../js/agentui.js) on the consumer side.
"""

from agentui.protocol import COMPONENT_CATALOG, UI_PROTOCOL_VERSION
from agentui.blocks import (
    UiBlock,
    calendar,
    chart,
    compare,
    download,
    form,
    keyvalue,
    table,
    timeline,
    ui_event,
)
from agentui.validation import is_valid, validate

__version__ = "1.0.0"

__all__ = [
    "COMPONENT_CATALOG",
    "UI_PROTOCOL_VERSION",
    "UiBlock",
    "calendar",
    "chart",
    "compare",
    "download",
    "form",
    "is_valid",
    "keyvalue",
    "table",
    "timeline",
    "ui_event",
    "validate",
]
