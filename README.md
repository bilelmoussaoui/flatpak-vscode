# VSCode + Flatpak Integration

![CI](https://github.com/bilelmoussaoui/flatpak-vscode/workflows/CI/badge.svg) ![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/bilelmoussaoui.flatpak-vscode)
[![Matrix Chat](https://img.shields.io/badge/Matrix-Chat-green)](https://matrix.to/#/#flatpak-vscode:gnome.org)

A simple VSCode extension that detects a Flatpak manifest and offers various commands to build, run, and export a bundle.

## Download

- [Microsoft Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bilelmoussaoui.flatpak-vscode)
- [Open VSX Registry](https://open-vsx.org/extension/bilelmoussaoui/flatpak-vscode)

## Requirements

- `flatpak`
- `flatpak-builder`

  If you're using Fedora Silverblue, you will have to layer `flatpak-builder` as it is no longer part of the base image. You can use something like `rpm-ostree install flatpak-builder`.

## Commands

- Build: Initialize a Flatpak build, update the dependencies & build them. It also does a first build of the application.
- Build and Run: Build or rebuild the application then run it.
- Stop: Stop the currently running task.
- Run: Run the application.
- Update Dependencies: Download/Update the dependencies and builds them.
- Clean: Clean the Flatpak repo directory (`.flatpak/repo`) inside the current workspace.
- Runtime Terminal: Spawn a new terminal inside the specified SDK.
- Build Terminal: Spawn a new terminal inside the current build repository (Note that the SDKs used are automatically mounted and enabled as well).
- Show Output Terminal: Show the output terminal of the build and run commands.
- Select Manifest: Select or change the active manifest.

## Integrations

Other extensions like `rust-analyzer` and `vala` mostly works better if it integrates with the
Flatpak runtime. Some integrations may prevent rebuilds or requiring to install dependencies in
the host. If you want to contribute on adding an integration, see [CONTRIBUTING](CONTRIBUTING.md).

### [Meson Build](https://marketplace.visualstudio.com/items?itemName=mesonbuild.mesonbuild)

- Overrides `mesonbuild.configureOnOpen` to not ask to configure the build directory; this should be handled by Flatpak.
- Overrides `mesonbuild.buildFolder` to use the build directory used by Flatpak.
- Overrides `mesonbuild.mesonPath` to use the meson binary from the SDK.

### [Rust Analyzer](https://marketplace.visualstudio.com/items?itemName=matklad.rust-analyzer)

- Overrides `rust-analyzer.server.path` and `rust-analyzer.runnables.command` to use the SDK's rust-analyzer and cargo binaries respectively. This is to avoid requiring build dependencies to be installed in the host.
- Overrides `rust-analyzer.files.excludeDirs` to set rust-analyzer to ignore `.flatpak` folder.

### [Vala](https://marketplace.visualstudio.com/items?itemName=prince781.vala)

- Overrides `vala.languageServerPath` to use the SDK's Vala Language Server.

## Contributing

Click [here](CONTRIBUTING.md) to find out how to contribute.
