# Change Log

## [unreleased]
- feat: set Devel manifest as default manifest if any
- fix: Only write to workspace configuration when settings need to change

## [0.0.36]

- misc: also exit spawned command as flatpak-spawn exit
- Remove host filesystem build restriction

## [0.0.35]

- Use relative path in generated settings.json
- Fix logic when generating environment variables overrides
- Fix simple build system generated commands

## [0.0.34]

- Fix check of the fonts cache before running the application
- Cache the a11y bus arguments

## [0.0.33]

- Drop unneeded host permission
- Fix: `TypeError` in podman development

## [0.0.32]

- Mount fonts directories
- Support running inside a container like toolbox
- Expose session accessibility bus
- Fix remote development support

## [0.0.31]

- Stop wrapping `--talk-name=` ending with `*` in `''`

## [0.0.30]

- Add command to show application's data directory
- Fallback to the Flatpak-installed `flatpak-builder` (`org.flatpak.Builder`) when it is not found on host
- Automatically resize output terminal when terminal window resizes
- Drop rust-analyzer runnables.extraArgs target-dir override
- Update to node v16
- Don't require finish-args

## [0.0.29]

- Update Flatpak logo

## [0.0.28]

- Update Rust Analyzer extension ID

## [0.0.27]

- Update Vala/Rust Analyzer integrations
- Catch runner errors and avoid VSCode showing a message dialog for them
- Other cleanup

## [0.0.26]

- Only `appendWatcherExclude` when there is an active manifest
- Don't show run/stop button when there is no active manifest
- Disable keyboard shortcuts when there is no active manifest
- Fix missing SDKs verification
- Simplify the build pipeline
- Fix multiple config-opts

## [0.0.25]

- Added `mesonbuild.mesonbuild` extension integration.
- Added `post-install` manifest option support.
- Rename `rebuild` command to `build-and-run`. It would also now do a build automatically without having to run a separate `build` command.
- Don't require for the build to be initialized when running `clean` command.
- Add Export bundle command
- Drop the `preview` flag

## [0.0.24]

- New play and stop button in editor title UI
- Build terminal now uses the application ID
- Runtime terminal now uses the runtime ID
- Show error if certain runtimes are not installed
- Improved other extension integration API
- Fix migration

## [0.0.23]

- Integrate with Vala language server

## [0.0.22]

- Support `x-run-args`
- Fix state migration to the new format
- Lazily load the Flatpak version (only needed when checking if --require-version is used)

## [0.0.21]

- New Flatpak manifest selector
- Watch for Flatpak manifests changes and modify state accordingly
- Support JSON manifests with comments
- Better state management

## [0.0.20]

- Actually fix Runtime terminal when sandboxed

## [0.0.19]

- Fix Build/Runtime terminal when sandboxed

## [0.0.18]

- Fix colored outputs in sandboxed VSCode
- Prevent terminal output from getting cut off in first launch

## [0.0.17]

- New output terminal for less output delay and working terminal colors
- New status bar item for current build and run status
- New rust-analyzer integration to run runnables within the sandbox
- Improved build and runtime terminal integration
- Trigger documents portal in activate (May still be problematic when other extensions, like-rust-analyzer, startups earlier)
- Display the "Flatpak manifest detected" dialog only once
- Code cleanup

## [0.0.16]

- Mark dependencies as not build after an update
- Simplify the usage of the extensions, you can now just run a `Flatpak: build` from the command and it will do everything you need. You can followup with a `Flatpak: run` or a `Flatpak: rebuild the application`

## [0.0.15]

- Don't hardcode the path to `/usr/bin/bash`
- Code cleanup

## [0.0.14]

- Make use of `prepend-path` `append-ld-library-path` `prepend-ld-library-path` `append-pkg-config-path` `prepend-pkg-config-path` in `build-options` when opening a build terminal

## [0.0.13]

- support `prepend-path` `append-ld-library-path` `prepend-ld-library-path` `append-pkg-config-path` `prepend-pkg-config-path` in `build-options`
- support `build-options` in a module
- configure `rust-analyzer`'s `excludeDirs` option to exclude `.flatpak`
- reset `rust-analyzer` overrides when the extension is disabled
- use flatpak-builder schema from upstream repository

## [0.0.12]

- use an output channel instead of a hackish terminal
- autotools buildsystem support

## [0.0.11]

- Allow to re-run a command if the latest one failed
- Configure Rust-Analyzer only if the Flatpak repository is initialized

## [0.0.10]

- Properly detect if a command is running before spawning the next one

## [0.0.9]

- Forward host environment variables when running a command inside the sandbox
- `cmake` & `cmake-ninja` build systems support
- Use one terminal for all the extensions commands instead of spawning a new terminal per task
- Save the pipeline state per project & restore it at start

## [0.0.8]

- Properly initialize a new Rust project
- Ensure `.flatpak` directory exists before re-configuring r-a

## [0.0.6]

- New Command: Open Runtime Terminal
- New Command: Open Build Terminal, like the runtime one but inside the current repository
- Support Sandboxed Code: Automatically switch to flatpak-spawn --host $command if Code is running in a sandboxed environment like Flatpak
- Rust Analyzer integration: Spawn R-A inside the sandbox if in a Rust project
- Use a custom terminal provider: we can finally track if a command has failed to not trigger the next one automatically. The downside of this is we have lost colored outputs in the terminal for now...
- Schema Fixes
