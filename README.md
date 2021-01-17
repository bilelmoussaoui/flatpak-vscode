# VSCode + Flatpak integration

![CI](https://github.com/bilelmoussaoui/flatpak-vscode/workflows/CI/badge.svg)

A very simple VSCode extension that detects a Flatpak manifest and offers various commands to build, run & export a bundle.

## Download

- [Microsoft Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bilelmoussaoui.flatpak-vscode)
- [Open VSX Registry](https://open-vsx.org/extension/bilelmoussaoui/flatpak-vscode)

## Requirements

- `flatpak`
- `flatpak-builder`

## Commands

- Initialize:  Initialize the build directory, once the task is over, it triggers a "Update Dependencies"
- Update Dependencies: Download/Update the dependencies, once the task is over, it triggers a "Build Dependencies"
- Build Dependencies: Build all the modules specified in the manifest except the last one
- Build:  Build the latest module, by detecting the `buildsystem`, the extension runs the proper build commands to build the application
- Rebuild: Rebuild the application and triggers a "Run"
- Run: Run the application
- Clean: Clean the build directory (`.flatpak`) inside the current workspace
- Runtime Terminal: Spawn a new terminal inside the specified Sdk
- Build Terminal: Spawn a new terminal inside the current build repository (Note that the SDKs used are automatically mounted and enabled as well)

## Contributing

Click [here](CONTRIBUTING.md) to find out how to contribute.
