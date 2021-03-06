# Change Log

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
