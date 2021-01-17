# Change Log

## [0.0.6]

- New Command: Open Runtime Terminal
- New Command: Open Build Terminal, like the runtime one but inside the current repository
- Support Sandboxed Code: Automatically switch to flatpak-spawn --host $command if Code is running in a sandboxed environment like Flatpak
- Rust Analyzer integration: Spawn R-A inside the sandbox if in a Rust project
- Use a custom terminal provider: we can finally track if a command has failed to not trigger the next one automatically. The downside of this is we have lost colored outputs in the terminal for now...
- Schema Fixes
