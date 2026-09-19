"""AgentUI protocol constants (v1).

The catalog is the single source of truth shared by producers (this package),
consumers (the JS reference renderer), and the JSON schemas in spec/schemas/.
Adding a component requires: catalog entry + schema + both reference
implementations — otherwise consumers silently drop the block.
"""

from __future__ import annotations

UI_PROTOCOL_VERSION = 1

COMPONENT_CATALOG: frozenset[str] = frozenset(
    {
        "keyvalue",
        "table",
        "form",
        "timeline",
        "compare",
        "download",
        "chart",
        "calendar",
    }
)

__all__ = ["COMPONENT_CATALOG", "UI_PROTOCOL_VERSION"]
