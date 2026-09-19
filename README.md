# AgentUI — Wire Protocol Specification

**A declarative UI block protocol for agent responses.** Structure survives the
last mile: engines produce structured data (tables, timelines, charts), and
AgentUI delivers that structure to the user's screen directly — instead of
letting the model flatten it into prose and introduce transcription errors
along the way.

> This repository contains the **protocol specification only** (wire format,
> component schemas, security model). Reference implementations are maintained
> privately by the specification authors; the schemas are the contract.

## Why a protocol

- **Structure survives the last mile.** A model narrating a 12-palace chart
  will occasionally swap adjacent values (measured in production: engine says
  *Shatabhisha*, narration says *Dhanishta). Blocks bypass narration.
- **Controlled catalog, not arbitrary HTML.** Eight whitelisted components.
  No script injection surface; payloads are untrusted data.
- **Forward-compatible via version negotiation.** Events carry `uiVersion`;
  a client that supports version N silently drops whole events above N.

## The v1 catalog

| Component | Purpose |
|---|---|
| `keyvalue` | label/value overview card |
| `table` | record list |
| `form` | structured input — multi-step, conditional fields, validated |
| `timeline` | ordered periods with a "now" marker |
| `compare` | two-party dimension comparison (score bars) |
| `download` | client-side file export (Blob, never fetches) |
| `chart` | line / bar chart (SVG, no chart libraries) |
| `calendar` | day cards (almanac-style) |

Full contracts: [`spec/wire-protocol.md`](spec/wire-protocol.md) and
[`spec/schemas/*.schema.json`](spec/schemas/).

## Security model

1. **Payloads are data, not code.** No block field is evaluated or injected
   as HTML. The `download` component materializes files client-side from
   `fileText`; it never fetches URLs found in a block.
2. **Rendering is text-only.** Reference implementations insert payload
   strings via `textContent`, never `innerHTML`.
3. **Fail closed on garbage.** Malformed blocks are dropped, not repaired.
4. **Both sides enforce caps.** Producers clip; renderers clip again.

## Implementing the protocol

The JSON schemas in `spec/schemas/` are the authoritative contract. A
consumer needs to:

1. Parse `UI` events from the stream (SSE or any ordered channel)
2. Check `uiVersion ≤ your supported version`; drop the whole event otherwise
3. Render only catalog-listed components; drop unknown ones
4. Insert all payload strings via `textContent` (or SVG equivalent)
5. Enforce the caps in the schemas defensively

## License

[Apache-2.0](LICENSE). © 2026 The AgentUI specification authors.
