# VScode + Flatpak integration

A very simple VScode extension that detects a Flatpak manifest and offers to build/run a test build. 
It tries to detect if a Flatpak manifest is found (either a .yml or a .json) and starts a build job
that builds all the modules from the manifest except the last one.
After whatever changes, you can use command palette to run the application which will re-build the latest module 
and run the application in a Flatpak sandboxed env.

## Requirements

* `flatpak`
* `flatpak-builder`
