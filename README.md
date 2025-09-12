# lcod-registry

Git registry of **LCP** components (one folder per component), fetchable via raw Git URLs, HTTP, or file://.

## Component layout

```
<namespace>/<name>/
  lcp.toml
  README.md
  schema/*.json
  assets/
  doc_assets/
  impl/<lang>/{meta.toml,deps.json,...}
  tests/unit/*.json
```

## Examples

- `core/http_get/`
- `demo/my_weather/`
