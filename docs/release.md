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
npm run app:mac   # dmg and zip, Apple silicon (arm64) only
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
   - `NotePane-<version>-arm64.dmg`, for people to download (Apple silicon only; Intel Macs are not supported);
   - the matching `-mac.zip` files and `latest-mac.yml`, read by the updater;
   - `NotePane-Setup-<version>.exe` and `latest.yml`, for Windows.
4. Check the draft on the repository's Releases page, edit the notes if needed, and press **Publish release**.

A draft is invisible to visitors and to the update check, so nothing reaches users until step 4.

## Updates inside the app

A packaged app checks GitHub Releases at startup and every six hours (`electron/appUpdates.cjs`). The check sends no
note data; GitHub sees an ordinary download request.

- **Windows:** the update downloads in the background and installs when the app quits.
- **macOS, signed build:** the same.
- **macOS, unsigned build:** Squirrel.Mac only updates an app signed with a Developer ID, so the app updates itself as
  TablePeek does (`electron/macSelfUpdate.cjs`): it downloads the release's `-arm64-mac.zip` named in
  `latest-mac.yml`, checks its SHA-512 against the one listed there, unpacks it with `ditto` and checks its version.
  Then **Restart to update** appears in the tabs window's header and in Preferences > About (the sticky layout asks in
  a dialog). It saves the notes and quits; a detached script waits for the app to end, copies the new bundle beside
  the old one, swaps them (putting the old one back if the swap fails) and opens NotePane. A copy that cannot be
  replaced (run from the disk image, translocated by Gatekeeper, or in a folder the user cannot write) offers the
  release page instead. Versions before 0.5.1 only open the release page, so they need one manual update. The
  Homebrew cask says `auto_updates true`, so `brew upgrade` leaves the app's own updates alone.

Preferences > About has **Check for updates**, which runs the same check at once (`checkNow()` through the
`app:check-for-updates` IPC) and shows the result on the page: up to date, a newer version (downloading, then
**Restart to update** on a Mac, or a note that it installs when NotePane quits on Windows), or the reason a check
failed. In development, test builds and the browser preview the page says "Update checks run in the installed app".
Versions are compared by their numbers (`compareVersions`), so 0.10.0 is newer than 0.9.2.

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

`brew install --cask extransload/tap/notepane` installs the published dmg on an Apple silicon Mac and clears the
download quarantine, so an ad-hoc signed build opens without **Open Anyway**. The cask is `Casks/notepane.rb` in
[Extransload/homebrew-tap](https://github.com/Extransload/homebrew-tap), which also holds TablePeek's.

`.github/workflows/homebrew.yml` writes it with `scripts/homebrew-cask.mjs` from the release's dmg and pushes it
to the tap when a stable release is published (step 4 above); a draft or prerelease never reaches it. To push the cask
for a release published before the workflow existed, run the workflow from the Actions tab with the tag. The push uses
a deploy key with write access to the tap only, stored once as a secret. Run this yourself, so the key never passes
through anyone else's screen or logs:

```bash
gh secret set HOMEBREW_TAP_DEPLOY_KEY < tap_deploy_key   # the private key of the tap's deploy key
```

To try a cask before publishing, write it from local dmgs with
`node scripts/homebrew-cask.mjs v<version> <dir> --base-url file://<dir>`.

The cask has no `auto_updates`, because an ad-hoc signed Mac build only links to the release, so `brew upgrade`
installs new versions. Once releases are signed and the app updates itself, add `auto_updates true` and drop the
quarantine step.
