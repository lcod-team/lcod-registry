# AGENT — lcod-registry

## Mission
Host clean, validated, packaged LCP components.

## Constraints
- Every component must include a valid `lcp.toml`.
- Include `schema/` and `tests/` where applicable.
- No network in tests (mocks only).

## Definition of Done
- CI validates structure & schemas
- At least 3 base components published (`http_get`, `parse_json`, `my_weather`)
