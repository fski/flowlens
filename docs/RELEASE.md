# FlowLens Release Checklist

## Pre-release

1. **Bump version** in `src/shared/version.js`:
   ```js
   const FLOWLENS_VERSION = "x.y.z";
   ```
   This is the single source of truth. The build injects it into `manifest.json` and `panel.html`.

2. **Update `package.json` version** to match (for npm metadata consistency):
   ```json
   "version": "x.y.z"
   ```

3. **Run tests locally**:
   ```sh
   npm test
   ```

4. **Build and package**:
   ```sh
   npm run build
   npm run package
   npm run package:audit
   ```

5. **Verify**:
   - `dist/manifest.json` has the correct version
   - `artifacts/flowlens-x.y.z.zip` exists and audit passes
   - Load `dist/` as an unpacked extension in `chrome://extensions` and verify it works

## Publish

6. **Upload** `artifacts/flowlens-x.y.z.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - The extension is **UNLISTED** — keep it that way unless explicitly changing visibility
   - Submit for review

7. **Commit and push**:
   ```sh
   git add src/shared/version.js package.json
   git commit -m "release: v x.y.z"
   git push
   ```

8. **Tag the release** (optional):
   ```sh
   git tag vx.y.z
   git push --tags
   ```

## Notes

- Internal data versions (`schemaVersion`, `signatureVersion`, `frameKeyVersion`, `EN_MAPPING_VERSION`) are independent of the extension version and should NOT be bumped here
- The `dist/` directory is gitignored and regenerated on every build
- The `artifacts/` directory is gitignored — zips are ephemeral build outputs
