# VSCode + Flatpak integration

![CI](https://github.com/bilelmoussaoui/flatpak-vscode/workflows/CI/badge.svg)

A very simple VSCode extension that detects a Flatpak manifest and offers various commands to build, run & export a bundle.

## Download

- [Microsoft Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bilelmoussaoui.flatpak-vscode)
- [Open VSX Registry](https://open-vsx.org/extension/bilelmoussaoui/flatpak-vscode)

## Requirements

- `flatpak`
- `flatpak-builder`

  if you're using Fedora Silverblue, you will have to layer `flatpak-builder` as it is no longer part of the base image. You can use something like `rpm-ostree install flatpak-builder`

## Commands

- Build: Initialize a Flatpak build, update the dependencies & build them. It also does a first build of the application.
- Rebuild: Rebuild the application and triggers a "Run" command.
- Run: Run the application
- Update Dependencies: Download/Update the dependencies and builds them.
- Clean: Clean the build directory (`.flatpak`) inside the current workspace.
- Runtime Terminal: Spawn a new terminal inside the specified SDK.
- Build Terminal: Spawn a new terminal inside the current build repository (Note that the SDKs used are automatically mounted and enabled as well).
- Show Output Terminal: Show the output terminal of the build and run commands.
- Select Manifest: Change the active manifest.

## Integrations

### Rust Analyzer

- Overrides `rust-analyzer.server.path` to utilize SDK's rust-analyzer and `rust-analyzer.runnables.overrideCargo` to utilize SDK's cargo. This make sures that rust-analyzer and cargo uses package from the runtime instead of the host packages.
- Overrides `rust-analyzer.runnables.cargoExtraArgs` to set cargo's `--target-dir` to `_build/src`. Identical target dir must be set on your build system to prevent rebuilding when running rust-analyzer runnables.
- Overrides `rust-analyzer.files.excludeDirs` to set rust-analyzer to ignore `.flatpak` folder.

## Contributing

Click [here](CONTRIBUTING.md) to find out how to contribute.
