# Change Log

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
