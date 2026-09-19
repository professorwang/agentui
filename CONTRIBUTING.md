# Contributing

Thanks for considering a contribution.

## Ground rules

1. **The catalog is deliberately small.** Every component must serve a real
   use case that existing components cannot express. Proposals for new
   components should open an issue first with: the use case, why the current
   catalog fails it, and the payload shape. Adding a component means: catalog
   entry + JSON schema + both reference implementations + tests.
2. **Never weaken the security model.** Payloads are untrusted data; all
   rendering goes through `textContent` / `createElementNS`. `innerHTML`,
   `eval`, URL fetching from block fields, and event-handler attributes are
   automatic reject. If a PR "just renders rich HTML", it will be closed.
3. **Keep both implementations in sync.** `js/agentui.js` (consumer) and
   `python/agentui` (producer) must agree on every contract; schemas are the
   tiebreaker.
4. **Bump `uiVersion` for breaking wire changes.** Consumers drop events they
   don't understand, so old deployments keep working against new producers.

## Development

```bash
# JS renderer tests (zero dependencies)
cd js && node test/agentui.test.mjs

# Python builder tests
cd python && uv run pytest
```

Both suites must pass. New behavior needs tests — including a test that
malformed input is *dropped*, not repaired.

## Pull requests

- Small, focused PRs with tests.
- Explain the use case in the description, not just the implementation.
- By submitting, you agree the contribution is licensed Apache-2.0.
