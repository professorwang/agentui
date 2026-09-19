# AgentUI Wire Protocol

AgentUI delivers **structured, renderable UI blocks** from an agent backend to a
thin client, alongside (not inside) the narrative text stream.

Design goals:

1. **Structure survives the last mile.** Engines produce structure (tables,
   timelines, charts); narration flattens it and introduces transcription
   errors. Blocks bypass narration entirely.
2. **Controlled catalog.** Only whitelisted components may be rendered. No
   arbitrary HTML/JS is ever accepted — payloads are **untrusted data**.
3. **Bounded by contract.** Block counts, rows, columns and cell lengths have
   hard caps so a misbehaving producer cannot blow up a client.
4. **Forward-compatible via version negotiation.**

## Transport

Any ordered streaming channel works. The reference transport is Server-Sent
Events with JSON payloads:

```
data: {"type": "UI", "data": {"uiVersion": 1, "blocks": [ <block>, ... ]}}
```

- One event may carry one or more blocks; clients render them progressively.
- `UI` events interleave freely with text deltas
  (`{"type": "MESSAGE", "data": {"delta": "..."}}`); blocks are appended to the
  conversation, they do not interrupt text.
- Blocks MUST NOT be embedded into the text channel. Rendering data placed in
  the model's context burns tokens and teaches the model to re-narrate
  structure — the exact failure this protocol exists to prevent.

## Version negotiation

- Every event carries `uiVersion` (integer, starting at 1).
- A client that supports version `N` MUST silently drop entire events with
  `uiVersion > N` — degrading to text-only is always safe because the text
  channel remains complete.
- Producers must treat unknown future fields as ignorable (consumers likewise).

## Block envelope

Every block is a JSON object with at least:

```json
{ "component": "<catalog-name>", "title": "optional card title" }
```

plus component-specific fields defined in `schemas/`. Two hard rules:

- `component` MUST be in the catalog below. Unknown components are dropped,
  never guessed.
- All string fields are untrusted. Reference renderers insert them via
  `textContent` (or `createElementNS` + `textContent` for SVG), never
  `innerHTML`.

## Component catalog (v1)

| Component | Purpose | Key fields |
|---|---|---|
| `keyvalue` | label/value overview card | `items: [{label, value}]` |
| `table` | record list | `columns: [string]`, `rows: [[cell, ...]]` |
| `form` | structured input (multi-step, validated) | `fields: [...]`, `steps`, `submitLabel` |
| `timeline` | ordered periods with a "now" marker | `items: [{start, end?, title?, note?}]`, `now?` |
| `compare` | two-party dimension comparison | `dimensions: [{label, score, summary?, personA?, personB?}]`, `overallScore?`, `tier?`, `labels?` |
| `download` | client-side file export | `filename`, `mimeType`, `fileText`, `buttonLabel`, `preview?` |
| `chart` | line or bar chart | `chartType: "line"|"bar"`, `series: [{topic, label, points, reverse?}]`, `yMin?`, `yMax?`, `note?` |
| `calendar` | day cards (e.g. almanac) | `days: [{date, ganZhi?, yi?, ji?}]`, `labels?` |

Suggested caps a producer should enforce (and the reference renderers tolerate):

- ≤ 5 blocks per response, ≤ 3 tables, ≤ 24 rows × 8 columns per table
- ≤ 120 chars per cell (producers may clip with an ellipsis marker)
- ≤ 20 KB for `download.fileText`

## Security model

- **Payloads are data, not code.** No block field is ever evaluated, injected
  as HTML, or used as a URL that is fetched automatically. The `download`
  component materializes its file client-side from `fileText` via `Blob`.
- **Rendering is text-only.** Reference implementations never construct markup
  from payload strings.
- **Fail closed on garbage.** Malformed blocks are dropped, not repaired.
