# lcod-registry

Official Git registry for LCOD components. The repository stores immutable
manifests and a generated catalogue (`packages.jsonl`, `registry.json`) that
clients and kernels consume via the helpers published in
[`lcod-spec`](https://github.com/lcod-team/lcod-spec).

## Repository layout

```
catalog.json                           # declarative list of registries/namespaces/packages
packages/
  <namespace>/<component>/versions.json  # append-only list of published versions
  <namespace>/<component>/<version>/manifest.json
packages.jsonl                         # generated JSON Lines catalogue
registry.json                          # generated registry metadata (namespaces + package map)
scripts/update-registry.mjs            # regenerate the catalogue via LCOD kernel
scripts/validate-registry.mjs          # sanity checks for catalog/versions/manifests
```

Each `manifest.json` points at the source repository and enumerates the files that
make up the component version. The catalogue is generated from `catalog.json` and
all `versions.json` files by the LCOD component
`lcod://tooling/registry/catalog/generate@0.1.0`.

## Workflow

1. **Add / update a release**
   - Update the relevant `packages/<namespace>/<name>/versions.json` with the new
     entry (new versions must be appended at the top of the array).
   - Create the associated `manifest.json` describing the artefact.
2. **Validate the catalogue**
   ```bash
   npm run validate
   ```
   Ensures every package declared in `catalog.json` has matching versions and
   manifests, and that releases are ordered newest → oldest.
3. **Regenerate the derived files**
   ```bash
   npm run generate
   ```
   Runs the LCOD generator component through the Node kernel and rewrites
   `packages.jsonl` / `registry.json` when needed.
4. **Commit & push** – if `npm run generate` produced changes, commit them with
   the release payload. The CI workflow checks for drift on pull requests and,
   on direct pushes, commits the catalogue update automatically (using the
   `[registry ci]` marker to prevent loops).

## Continuous Integration

`.github/workflows/sync-catalog.yml`:
- fetches `lcod-spec` and `lcod-kernel-js`
- runs `npm run validate`
- runs `npm run generate`
- on pull requests: fails when the catalogue is out of sync
- on pushes: commits updated artefacts with message
  `chore(registry): sync catalogue [registry ci]`

## Published helpers

| Component ID                                   | Version | Source repository |
| ---------------------------------------------- | ------- | ----------------- |
| `lcod://tooling/registry/catalog/generate`     | 0.1.0   | `lcod-spec`       |
| `lcod://tooling/registry/source/load`          | 0.1.0   | `lcod-spec`       |
| `lcod://tooling/registry/resolution`           | 0.1.0   | `lcod-spec`       |
| `lcod://tooling/registry/index`                | 0.1.0   | `lcod-spec`       |
| `lcod://tooling/registry/select`               | 0.1.0   | `lcod-spec`       |
| `lcod://tooling/registry/fetch`                | 0.1.0   | `lcod-spec`       |

New releases will be appended to the relevant `versions.json` files and propagated
by the generator.
