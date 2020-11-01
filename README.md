# VSCode + Flatpak integration 
![CI](https://github.com/bilelmoussaoui/flatpak-vscode/workflows/CI/badge.svg)

A very simple VSCode extension that detects a Flatpak manifest and offers various commands to build, run & export a bundle.

## Requirements

* `flatpak`
* `flatpak-builder`

## Commands

* `build-init` - Initialize the build directory, once the task is over, it triggers a `update-deps`

* `update-deps` - Download/Update the dependencies, once the task is over, it triggers a `build-deps`

* `build-deps` - Build all the modules specified in the manifest except the last one

* `build-app` - Build the latest module, by detecting the `buildsystem`, the extension runs the proper build commands to build the application

* `rebuild` - Rebuild the application and triggers a `run`

* `run` - Run the application

* `clean` - Clean the build directory (`.flatpak`) inside the current workspace
