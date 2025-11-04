# lcod-registry

Official pointer registry for LCOD catalogues. Instead of mirroring component
manifests, the repository now exports a lightweight JSON Lines manifest
(`catalogues.jsonl`) describing where each upstream catalogue lives (URL,
pinned commit, checksum). Resolvers merge this metadata with their own sources
configuration to discover catalogues.

## Repository layout

```
catalogues.jsonl                      # streaming manifest list consumed by resolvers
scripts/update-registry.mjs            # refresh catalogue pointers from local checkouts
scripts/validate-registry.mjs          # sanity checks for the pointer file
scripts/test-resolve-std.mjs           # ensures the std catalogue pointer matches components
```

## Workflow

1. **Refresh the catalogue pointers**
   ```bash
   npm run generate
   ```
   Looks for `./lcod-components` (or the parent directories, or `COMPONENTS_REPO_PATH`) and rewrites
   `catalogues.jsonl` with the latest commit + checksum for
   `registry/components.std.jsonl`.

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
   published in `lcod-components`), commit the regenerated `catalogues.jsonl`.

## Continuous Integration

`.github/workflows/sync-catalog.yml` runs `npm run validate` to ensure the
pointer file matches the expected shape. Because the manifest references commit
hashes, catalogue drift is immediately detectable.

## Adding new catalogues

When a new upstream catalogue becomes available:

1. Update `scripts/update-registry.mjs` to append a new entry with its metadata
   (id, description, and how to fetch it). Ideally pin a commit and publish a
   checksum to keep the supply chain auditable.
2. Re-run the `generate` and `validate` scripts.
3. Commit the change alongside any documentation updates.

This keeps the registry lightweight while making catalogue updates auditable.
