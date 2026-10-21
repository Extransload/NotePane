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

The macOS installer window walks through the steps an unsigned build needs: drag to Applications, open once and be
blocked, then **Open Anyway** in Privacy & Security, reached from the System Settings shortcut in the window. After
changing the window layout in `electron-builder.config.cjs` or the steps in `scripts/build-dmg-background.mjs`,
redraw its background:

```bash
npm run dmg-background   # writes build/background.tiff, macOS only
```

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
   - `NotePane-Setup-<version>.exe` and `latest.yml`, for Windows.
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

Signing removes these warnings. The workflow reads the credentials from repository secrets (Settings → Secrets and
variables → Actions) and picks them up on the next tag, with no code change.

### macOS: Developer ID and notarization

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) (paid yearly).
2. Create a **Developer ID Application** certificate (Xcode → Settings → Accounts → Manage Certificates, or the
   Certificates page of the developer site), then export it with its private key from Keychain Access as a `.p12`
   file protected by a password.
3. Create an app-specific password for your Apple ID at [account.apple.com](https://account.apple.com), and note
   your Team ID from the Membership page of the developer site.
4. Store them as secrets. Run these yourself, so the values never pass through anyone else's screen or logs:

   ```bash
   base64 -i DeveloperID.p12 | gh secret set MAC_CERTIFICATE
   gh secret set MAC_CERTIFICATE_PASSWORD     # prompts for the .p12 password
   gh secret set APPLE_ID                     # the Apple ID email
   gh secret set APPLE_APP_SPECIFIC_PASSWORD  # the app-specific password
   gh secret set APPLE_TEAM_ID                # the Team ID
   ```

5. Delete the exported `.p12` file once the secret is stored.

With these set, electron-builder signs with the Developer ID, enables hardened runtime with its default Electron
entitlements (JIT, unsigned executable memory, library validation off), notarizes with Apple, and marks the build
so that macOS updates install themselves. Notarization adds a few minutes to the macOS job.

### Windows

Since mid-2023, certificate authorities issue code signing keys only on a hardware token or in a cloud signing
service, so a new certificate cannot be exported as a `.pfx` file for a CI secret. The options are:

- **A cloud signing service from a certificate authority** (for example SSL.com eSigner, DigiCert KeyLocker or
  Certum SimplySign). Each provides a command-line tool, which the workflow calls through electron-builder's
  `win.sign` hook; that step is added once a provider is chosen.
- **Azure Artifact Signing** (formerly Trusted Signing), the cheapest option, configured through electron-builder's
  `win.azureSignOptions`. It is available only to individuals in the USA and Canada and to organizations in the USA,
  Canada, the EU and the UK.
- **A certificate that can still be exported as `.pfx`** (issued before mid-2023): store it as
  `base64 -i cert.pfx | gh secret set WIN_CERTIFICATE` and `gh secret set WIN_CERTIFICATE_PASSWORD`; the workflow
  already uses these.

A signed installer still builds SmartScreen reputation over its first downloads, so a new publisher may see the
warning for a while even after signing.

## Homebrew

Once releases are signed, a Homebrew Cask can install the published dmg. The cask needs the release URL and the
dmg's SHA-256.
