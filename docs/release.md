# Release

## Local app run

```bash
make run
```

This builds the Vite renderer and launches Electron.
When run from WSL, this creates `release/win-unpacked/` and launches the Windows `NotePane.exe` directly. That build
has update checks turned off, so it never installs a published release over itself.

## Local packages

Regenerate packaged icons after updating `assets/notepane-icon.png`:

```bash
make icons
```

```bash
npm run app       # the current OS
npm run app:mac   # dmg and zip, arm64 and x64
npm run app:win   # NSIS installer, x64
```

Packages land in `release/`. The configuration is `electron-builder.config.cjs`. A local build never uploads anything.

## Publishing a release

Releases are built by `.github/workflows/release.yml` and published on GitHub Releases, which is where people
download NotePane and where the app looks for updates.

1. Bump `version` in `package.json` (for example `0.2.0`) and commit it.
2. Tag the commit with the same version and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. The workflow checks that the tag matches `package.json`, runs `npm run verify:quick`, creates a draft release with
   generated notes, and builds on macOS and Windows runners. It uploads:
   - `NotePane-<version>-arm64.dmg` and `NotePane-<version>.dmg` (Intel), for people to download;
   - the matching `-mac.zip` files and `latest-mac.yml`, read by the updater;
   - `NotePane Setup <version>.exe` and `latest.yml`, for Windows.
4. Check the draft on the repository's Releases page, edit the notes if needed, and press **Publish release**.

A draft is invisible to visitors and to the update check, so nothing reaches users until step 4.

## Updates inside the app

A packaged app checks GitHub Releases at startup and every six hours (`electron/appUpdates.cjs`). The check sends no
note data; GitHub sees an ordinary download request.

- **Windows:** the update downloads in the background and installs when the app quits.
- **macOS, signed build:** the same.
- **macOS, unsigned build:** macOS only lets an app replace itself when it is signed with a Developer ID, so the app
  shows "NotePane x.y.z is available" with a **Download** button that opens the release page.

## Signing

Without signing, both systems warn on first launch:

- **macOS** blocks the app. The person opens it from System Settings → Privacy & Security → **Open Anyway**. The
  build is ad-hoc signed so that this works; an unsigned Apple Silicon download would instead be reported as damaged.
- **Windows** SmartScreen shows "Windows protected your PC". The person chooses **More info → Run anyway**.

Signing removes these warnings. Add these repository secrets (Settings → Secrets and variables → Actions); the
workflow picks them up on the next tag, with no code change.

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE` | Developer ID Application certificate exported as `.p12`, base64-encoded |
| `MAC_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_ID` | the Apple ID of the Apple Developer Program account |
| `APPLE_APP_SPECIFIC_PASSWORD` | an app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | the Team ID |
| `WIN_CERTIFICATE` | Windows code signing certificate as `.pfx`, base64-encoded |
| `WIN_CERTIFICATE_PASSWORD` | the `.pfx` password |

With the macOS secrets set, electron-builder signs with the Developer ID, enables hardened runtime, notarizes with
Apple, and marks the build so that macOS updates install themselves. The macOS secrets need an Apple Developer
Program membership. Windows certificates come from a certificate authority, or from a cloud signing service such as
Azure Trusted Signing, whose eligibility depends on the country; it is configured through electron-builder's
`win.azureSignOptions` rather than these two secrets.

## Homebrew

Once releases are signed, a Homebrew Cask can install the published dmg. The cask needs the release URL and the
dmg's SHA-256.
