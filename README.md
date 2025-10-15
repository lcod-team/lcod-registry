# lcod-registry

Official pointer registry for LCOD catalogues. Instead of mirroring component
manifests, the repository now exports a small `catalogues.json` file describing
where each upstream catalogue lives (URL, pinned commit, checksum). Resolvers
merge this metadata with their own `sources.json` to discover catalogues.

## Repository layout

```
catalogues.json                       # list of catalogues and how to fetch them
scripts/update-registry.mjs            # refresh catalogues.json from local checkouts
scripts/validate-registry.mjs          # sanity checks for the pointer file
scripts/test-resolve-std.mjs           # ensures the std catalogue pointer matches components
```

## Workflow

1. **Refresh the catalogue pointers**
   ```bash
   npm run generate
   ```
   Looks for `./lcod-components` (or the parent directories, or `COMPONENTS_REPO_PATH`) and rewrites
   `catalogues.json` with the latest commit + checksum for
   `registry/components.std.json`.

2. **Validate**
   ```bash
   npm run validate
   ```
   Checks schema, field types, and cross-validates the pinned commit & checksum
   against the local `lcod-components` checkout. The same script runs in CI.

3. **Optional smoke test**
   ```bash
   npm run test:resolve-std
   ```
   Performs the same integrity checks as the validator but prints additional
   context, making it convenient while iterating locally.

4. **Commit & push** – once the pointer is updated (usually when a new version is
   published in `lcod-components`), commit the regenerated `catalogues.json`.

## Continuous Integration

`.github/workflows/sync-catalog.yml` still runs `npm run validate` to ensure the
pointer file matches the expected shape. Once kernels consume `catalogues.json`
there is no catalogue drift to maintain.

## Adding new catalogues

When a new upstream catalogue becomes available:

1. Update `scripts/update-registry.mjs` to append a new entry with its metadata
   (id, description, priority, and how to fetch it). Ideally pin a commit and
   publish a checksum to keep the supply chain auditable.
2. Re-run the `generate` and `validate` scripts.
3. Commit the change alongside any documentation updates.

This keeps the registry lightweight while making catalogue updates auditable.
