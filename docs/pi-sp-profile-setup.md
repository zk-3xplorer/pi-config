# Reproducing the `pi-sp` Profile on Another Machine

This guide creates a Pi profile named `pi-sp` that is isolated from the normal
`pi` profile, loads Superpowers and interactive subagents from Git, and uses
selected extensions and skills from a local `pi-config` checkout.

The setup intentionally does **not** use automatic extension-source discovery.
Extensions needed by restricted subagents are exposed through conventional
paths under the `pi-sp` profile by symlinks.

## Resulting layout

```text
~/bin/pi-sp                                  # profile launcher
~/.pi-superpowers/agent/                     # isolated Pi agent directory
├── settings.json
├── auth.json                                # local, never commit
├── agents/                                  # optional profile overrides
├── extensions/
│   ├── ask-user-question.ts -> $PI_CONFIG_REPO/...
│   ├── bash-guard          -> $PI_CONFIG_REPO/...
│   ├── web-fetch           -> $PI_CONFIG_REPO/...
│   └── web-search          -> $PI_CONFIG_REPO/...
├── skills/                                  # selected pi-config skill links
├── git/                                      # Pi-managed Git packages
└── sessions/                                 # local, never commit

$PI_CONFIG_REPO/                             # normal Git clone
```

Normal `pi` continues to use `~/.pi/agent`. Only `pi-sp` uses
`~/.pi-superpowers/agent`.

## Scope and platform

The common profile setup works anywhere Pi and the selected extensions work.
The current `pi-interactive-subagents` fork is cmux-only, so that package and
its related steps require macOS with cmux. On Linux, omit the subagents package,
cmux hook, and cmux verification steps; the rest of the profile can still be
used.

Commands below assume a POSIX shell. Package-manager installation commands are
intentionally omitted: install Git, Node.js/npm, Pi, and cmux using the method
appropriate for the machine.

### Published branches used by this guide

The required changes are available on these remote branches:

- `zk-3xplorer/pi-interactive-subagents@feat/cmux-subagents` — cmux-only
  subagents and `pi-sp` launcher propagation. The commit verified while writing
  this guide is `0823113`.
- `zk-3xplorer/pi-config`, branch `feature/you-com-web-search` — You.com web
  search plus this setup guide. The web-search implementation starts at commit
  `cfb5248`; use the branch head for the latest guide corrections.

Branch names are convenient while debugging but can move. For a byte-for-byte
reproduction, substitute the recorded commit hashes or release tags after the
branches are finalized.

The four profile-specific agent definitions are not yet versioned. Exact
reproduction still requires publishing sanitized copies or deliberately
accepting the bundled defaults described in step 11.

## 1. Install prerequisites

Verify the required commands:

```bash
git --version
node --version
npm --version
pi --version
cmux --help                    # macOS subagent setup only
```

The cmux-only subagent extension must run inside cmux and requires
`CMUX_SOCKET_PATH` and `CMUX_SURFACE_ID` in the Pi process environment.

## 2. Choose portable locations

Add these variables to `~/.zshenv` (or the startup file for the shell used to
launch Pi):

```zsh
export PI_SP_AGENT_DIR="$HOME/.pi-superpowers/agent"
export PI_CONFIG_REPO="$HOME/src/pi-config"
export PATH="$HOME/bin:$PATH"

# Optional: useful while developing the subagents package locally.
export PI_SUBAGENTS_REPO="$HOME/src/pi-interactive-subagents"
```

Reload the shell:

```bash
exec "$SHELL" -l
```

Verify:

```bash
printf 'PI_SP_AGENT_DIR=%s\n' "$PI_SP_AGENT_DIR"
printf 'PI_CONFIG_REPO=%s\n' "$PI_CONFIG_REPO"
printf 'PI_SUBAGENTS_REPO=%s\n' "${PI_SUBAGENTS_REPO:-not-set}"
```

Do **not** export `PI_CODING_AGENT_DIR` globally. Doing so would make ordinary
`pi` use the `pi-sp` profile too.

### Environment variables and `settings.json`

Shell variables such as `$PI_CONFIG_REPO` are expanded in shell commands, but
Pi does not interpolate arbitrary environment variables inside JSON strings.
Pi does expand a leading `~` in settings paths. This guide avoids repository
paths in `settings.json` by using profile-local symlinks.

## 3. Clone `pi-config`

```bash
mkdir -p "$(dirname "$PI_CONFIG_REPO")"
git clone --branch feature/you-com-web-search \
  https://github.com/zk-3xplorer/pi-config.git "$PI_CONFIG_REPO"
```

Real credentials do not belong in this repository.

## 4. Install dependencies for selected `pi-config` extensions

Install dependencies in extension directories that contain lockfiles:

```bash
(cd "$PI_CONFIG_REPO/extensions/bash-guard" && npm ci)
(cd "$PI_CONFIG_REPO/extensions/web-fetch" && npm ci)
```

If the browser extension is enabled:

```bash
(cd "$PI_CONFIG_REPO/extensions/browser" && npm ci)
(cd "$PI_CONFIG_REPO/extensions/browser" && \
  npx --no-install playwright-core install chromium)
```

The current `web-search` extension uses Pi-provided packages and does not have
an extension-local npm install step.

## 5. Create the isolated profile launcher

```bash
mkdir -p "$HOME/bin"
cat > "$HOME/bin/pi-sp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

export PI_CODING_AGENT_DIR="${PI_SP_AGENT_DIR:-$HOME/.pi-superpowers/agent}"
export PI_SUBAGENT_CLI="pi-sp"
export PI_BROWSER_PROFILE="${PI_BROWSER_PROFILE:-$PI_CODING_AGENT_DIR/browser-profile}"

exec pi "$@"
EOF
chmod +x "$HOME/bin/pi-sp"
```

Open a new shell and verify:

```bash
command -v pi-sp
pi-sp --version
```

`PI_CODING_AGENT_DIR` isolates settings, packages, authentication, sessions,
and model configuration. `PI_SUBAGENT_CLI=pi-sp` tells child and resumed agents
to launch through the same profile wrapper instead of bare `pi`.
`PI_BROWSER_PROFILE` prevents the optional browser extension from writing its
cookies and persistent storage under ordinary Pi's `~/.pi/agent`. It points to
a real profile directory rather than inside the symlinked extension source.

## 6. Create the profile directory

```bash
mkdir -p "$PI_SP_AGENT_DIR"/{agents,extensions,skills}
chmod 700 "$PI_SP_AGENT_DIR"
```

Do not copy `auth.json`, sessions, caches, or API keys into a public repository.
Authentication is established separately on each machine.

## 7. Link selected `pi-config` extensions

Create links using the environment variable so the checkout may live anywhere:

```bash
ln -s "$PI_CONFIG_REPO/extensions/ask-user-question.ts" \
  "$PI_SP_AGENT_DIR/extensions/ask-user-question.ts"
ln -s "$PI_CONFIG_REPO/extensions/bash-guard" \
  "$PI_SP_AGENT_DIR/extensions/bash-guard"
ln -s "$PI_CONFIG_REPO/extensions/web-fetch" \
  "$PI_SP_AGENT_DIR/extensions/web-fetch"
ln -s "$PI_CONFIG_REPO/extensions/web-search" \
  "$PI_SP_AGENT_DIR/extensions/web-search"
```

If `web-debug` or direct browser tooling is enabled, also link and install the
browser extension:

```bash
ln -s "$PI_CONFIG_REPO/extensions/browser" \
  "$PI_SP_AGENT_DIR/extensions/browser"
```

On an existing machine, inspect each destination before replacing it:

```bash
ls -la "$PI_SP_AGENT_DIR/extensions"
```

Do not also list the real `pi-config` checkout paths in `settings.json`; loading
both the real path and symlink may register the same extension twice.

### Why these links matter to subagents

Restricted subagents start with `--no-extensions`. The launcher re-enables only
extensions required by the selected agent. Without automatic source discovery,
it looks for known tools at conventional profile paths, including:

```text
$PI_SP_AGENT_DIR/extensions/web-search/index.ts
$PI_SP_AGENT_DIR/extensions/web-fetch/index.ts
```

The links make those paths resolve to the local `pi-config` implementations.
`--tools` restricts which registered tools the child may use; it does not load
their implementation by itself.

The current resolver has explicit knowledge of a limited set of extension-backed
tools. A new custom tool must either use a recognized conventional path or call
the subagents runtime `registerToolExtension(name, path)` hook. This guide does
not enable automatic source discovery.

## 8. Link selected `pi-config` skills

Link only skills that are profile-compatible. `pdf-reader` has no hardcoded Pi
profile path:

```bash
ln -s "$PI_CONFIG_REPO/skills/pdf-reader" \
  "$PI_SP_AGENT_DIR/skills/pdf-reader"
python3 -m venv "$PI_CONFIG_REPO/skills/pdf-reader/.venv"
"$PI_CONFIG_REPO/skills/pdf-reader/.venv/bin/pip" install \
  -r "$PI_CONFIG_REPO/skills/pdf-reader/requirements.txt"
```

`web-debug` may be linked only when the browser extension from step 7 is also
linked and its lock-matched Playwright dependencies are installed:

```bash
ln -s "$PI_CONFIG_REPO/skills/web-debug" \
  "$PI_SP_AGENT_DIR/skills/web-debug"
```

Browser tools are disabled by default. Run this inside `pi-sp` before following
`web-debug` instructions:

```text
/browser on
```

Do not link these unchanged into the isolated profile:

- `analyze-sessions` currently hardcodes `~/.pi/agent`.
- `youtube-transcript` currently hardcodes `~/.pi/agent`.

They must first be changed to read `PI_CODING_AGENT_DIR` (or another explicit
profile path). Otherwise they either fail or operate on ordinary Pi's data.
Optional system tools used by `youtube-transcript` include `yt-dlp` and
`ffmpeg`.

## 9. Configure Git packages

During debugging, use the published feature branch. After stabilization, prefer
a release tag or commit hash because branches can move.

```json
{
  "packages": [
    "git:github.com/obra/superpowers",
    "git:github.com/zk-3xplorer/pi-interactive-subagents@feat/cmux-subagents"
  ],
  "lastChangelogVersion": "0.87.0",
  "theme": "dark",
  "defaultProvider": "openai-codex",
  "defaultModel": "gpt-5.6-sol",
  "compaction": {
    "enabled": true,
    "reserveTokens": 90000,
    "keepRecentTokens": 60000
  }
}
```

Save this as:

```text
$PI_SP_AGENT_DIR/settings.json
```

Do not add the `pi-config` extension paths to `settings.json`; they are loaded
from the conventional profile links created above.

Start Pi once so it installs missing Git packages:

```bash
pi-sp
```

Alternatively, install packages explicitly:

```bash
pi-sp install git:github.com/obra/superpowers
pi-sp install git:github.com/zk-3xplorer/pi-interactive-subagents@feat/cmux-subagents
```

Confirm package resolution:

```bash
pi-sp list
```

### Local subagents development override

While debugging a local checkout, replace the Git package entry temporarily
with the expanded local path. Pi cannot use `$PI_SUBAGENTS_REPO` literally in
JSON; use the value printed by:

```bash
printf '%s\n' "$PI_SUBAGENTS_REPO"
```

After publishing the changes:

1. Restore the Git package source in `settings.json`.
2. Run `pi-sp update --extensions`.
3. Restart `pi-sp`.

## 10. Install the cmux Pi hook

Install the generated cmux session extension into the isolated profile by
setting the agent directory for the installer invocation:

```bash
PI_CODING_AGENT_DIR="$PI_SP_AGENT_DIR" cmux hooks pi install --yes
```

Verify:

```bash
test -f "$PI_SP_AGENT_DIR/extensions/cmux-session.ts"
```

The file is generated and maintained by cmux. Do not copy or edit it manually.
Run the install command again after a cmux upgrade when required.

## 11. Configure agent definitions

`pi-interactive-subagents` bundles `scout`, `researcher`, and `worker`. Files in
`$PI_SP_AGENT_DIR/agents` override bundled definitions with the same names.

The current reference machine has local overrides for:

```text
general-purpose.md
researcher.md
scout.md
worker.md
```

All four currently select `openai-codex/gpt-5.6-sol`; `worker` may spawn
`scout` and `researcher`.

These overrides are currently profile-local and are therefore a blocking
portability gap for exact reproduction. Before migration, place sanitized
copies in a private or public Git repository and copy or link them into:

```text
$PI_SP_AGENT_DIR/agents/
```

If exact reproduction is not required, another machine can use the three
bundled definitions. Those bundled files currently select different models,
and `general-purpose` will be missing. Record that deviation explicitly in the
migration notes.

## 12. Configure model overrides

The reference profile contains this optional `$PI_SP_AGENT_DIR/models.json`:

```json
{
  "providers": {
    "openai-codex": {
      "modelOverrides": {
        "gpt-5.6-sol": {
          "contextWindow": 600000
        }
      }
    }
  }
}
```

Only add overrides supported by the installed provider/model.

## 13. Configure authentication and secrets

Launch the isolated profile and run `/login` for required providers:

```bash
pi-sp
```

Configure credentials for the exact `pi-config` ref selected in step 3.

For the You.com implementation on `feature/you-com-web-search`, use a private
shell configuration or secret manager:

```zsh
export YDC_API_KEY="<secret>"
```

Alternatively, create its ignored local file from
`extensions/web-search/auth.example.json`. The repository's `main` branch still
contains the prior Google search implementation and requires its documented
Google credentials instead; `YDC_API_KEY` does not configure that version.

Never commit:

```text
auth.json
extensions/**/auth.json
.env files
sessions/
API tokens
```

Authentication in `~/.pi/agent` is separate from authentication in the
`pi-sp` profile.

## 14. Verify profile isolation

In a fresh shell:

```bash
pi-sp list
readlink "$PI_SP_AGENT_DIR/extensions/web-search"
readlink "$PI_SP_AGENT_DIR/extensions/web-fetch"
test -f "$PI_SP_AGENT_DIR/extensions/web-search/index.ts"
test -f "$PI_SP_AGENT_DIR/extensions/web-fetch/index.ts"
test -f "$PI_SP_AGENT_DIR/extensions/cmux-session.ts"
```

Launch ordinary `pi` and `pi-sp` separately and confirm they use different
settings and session roots. `PI_CODING_AGENT_DIR` should be absent from the
ordinary shell environment:

```bash
env | grep '^PI_CODING_AGENT_DIR=' && \
  echo 'Unexpected global profile override' || \
  echo 'Normal pi remains isolated'
```

Inside `pi-sp`, verify:

1. `web_search` and `web_fetch` are available.
2. `subagents_list` lists the expected agents.
3. A `scout` can be spawned in cmux.
4. A `researcher` receives `web_search` and `web_fetch`.
5. A completed child result returns to the parent.
6. `subagent_message` can address and resume a named child.

The lifecycle checks require valid model credentials.

## 15. Updating the setup

### Update profile packages

```bash
pi-sp update --extensions
```

This updates packages for the selected profile without also updating the shared
Pi executable. `pi-sp update --all` updates Pi itself too, which also changes
ordinary `pi` because the executable is not profile-isolated.

Pinned Git refs do not move automatically. Change the configured ref explicitly
when adopting a new release.

### Update `pi-config`

```bash
git -C "$PI_CONFIG_REPO" fetch --all --tags
git -C "$PI_CONFIG_REPO" checkout feature/you-com-web-search
git -C "$PI_CONFIG_REPO" pull --ff-only
```

Then reinstall dependencies if lockfiles changed and restart `pi-sp` or run
`/reload`.

### Update cmux integration

```bash
PI_CODING_AGENT_DIR="$PI_SP_AGENT_DIR" cmux hooks pi install --yes
```

### Return from local subagents development to Git

1. Commit and push the subagents changes.
2. Create or select a stable tag/commit.
3. Replace the local package path in `settings.json` with the Git source.
4. Run `pi-sp update --extensions`.
5. Restart and run the verification checklist.

## 16. Linux variant

On Linux:

- Keep the separate `PI_SP_AGENT_DIR` and `pi-sp` launcher.
- Keep Superpowers, `pi-config` links, skills, models, and credentials.
- Omit cmux installation and its generated hook.
- Omit this cmux-only `pi-interactive-subagents` package unless a supported
  terminal backend is added later.
- Replace Homebrew-specific dependency commands with the distribution package
  manager.

Do not add fixed `/opt/homebrew` or `/Users/<name>` paths to portable profile
configuration.

## Portability checklist

Before declaring the profile reproducible:

- [ ] Every Git dependency is pushed and referenced by a stable ref.
- [ ] `pi-config` is cloned at `$PI_CONFIG_REPO`.
- [ ] Profile resource symlinks resolve.
- [ ] Extension-local npm dependencies are installed.
- [ ] `pi-sp` sets both `PI_CODING_AGENT_DIR` and `PI_SUBAGENT_CLI`.
- [ ] Normal `pi` remains unaffected.
- [ ] cmux hook is installed into the isolated profile.
- [ ] Agent overrides are versioned or their absence is accepted.
- [ ] Model overrides are documented.
- [ ] Credentials are configured locally and excluded from Git.
- [ ] Parent web tools work.
- [ ] Restricted researcher web tools work.
- [ ] Subagent spawn, completion, and resume work in cmux.
