# AGENT — lcod-registry

## Mission
Host clean, validated, packaged LCP components by curating pointers to upstream catalogues (no bulk mirroring).

## Constraints
- Every component must include a valid `lcp.toml`.
- Include `schema/` and `tests/` where applicable.
- No network in tests (mocks only).
- Registry entries should reference immutable sources (commit hashes, checksums, signatures).

## Definition of Done
- CI validates structure & schemas
- At least 3 base components published (`http_get`, `parse_json`, `my_weather`)
