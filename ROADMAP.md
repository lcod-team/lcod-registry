# Roadmap — lcod-registry

## M0
- Add `core/http_get` (axiom)
- Add `core/parse_json` (native TS)
- Add `demo/my_weather` (compose + tests)

## M1
- Add `core/extract_city`, `core/weather`
- CI: auto-validate (schemas + structure) and publish `.lcpkg` in Releases
- [x] Smoke test std components resolution via registry (`scripts/tests/resolve-std.lcp.yaml`)
- [ ] Adopt catalogue-of-catalogues format (no duplicate manifests in repo)
- [ ] Add resolver sources file scaffold + docs for configuring additional registries

## M2
- Per-component tags & releases
- Optional `index.json` for discovery
- Generate searchable catalog (for RAG)
