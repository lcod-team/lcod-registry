# Roadmap — lcod-registry

## M0
- Add `core/http_get` (axiom)
- Add `core/parse_json` (native TS)
- Add `demo/my_weather` (compose + tests)

## M1
- Add `core/extract_city`, `core/weather`
- CI: auto-validate (schemas + structure) and publish `.lcpkg` in Releases
- [x] Smoke test std components resolution via registry (`scripts/test-resolve-std.mjs`)
- [x] Adopt catalogue-of-catalogues format (no duplicate manifests in repo)
- [ ] Add resolver sources file scaffold + docs for configuring additional registries

## M2
- Per-component tags & releases
- Optional `index.json` for discovery
- Generate searchable catalog (for RAG)

## M3 — MCP-assisted authoring support
- Define MCP endpoints for registry interactions (list, reserve namespace, publish component revisions).
- Expose catalogue metadata in a machine-friendly format for MCP clients and RAG ingestion.
- Automate validation/sign-off flow so MCP-created components can land via PR with consistent checks.
