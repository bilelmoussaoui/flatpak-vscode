# Contributing

## Installation

### Flatpaked VSCodium/VSCode

1. Install the node18 SDK extension by executing the following:
```bash
flatpak install flathub org.freedesktop.Sdk.Extension.node18
```
Note: It will suggest multiple versions. To be sure which one to use, check the manifest in the flathub repo of [VSCodium](https://github.com/flathub/com.vscodium.codium/blob/master/com.vscodium.codium.yaml)/[VSCode](https://github.com/flathub/com.visualstudio.code/blob/master/com.visualstudio.code.yaml).

2. Enable it by adding the following line to `~/.bash_profile`:
```bash
export FLATPAK_ENABLE_SDK_EXT=node18
```

3. Log out and in again.

4. Open the `flatpak-vscode` repository with your editor.

5. Within the integrated terminal of your editor, execute the following commands at the root of the repository:
```bash
yarn install
```

6. To start debugging, run `F5`.

### Directly installed VSCodium/VSCode

1. Install `yarn` with your preferred method and make sure it is in your `PATH`.

2. Execute the following at the root of the repository:
```bash
yarn install
```

3. To start debugging, run `F5`.


## Integration with other extensions

To add an integration, follow the following steps:

1. Create a new file in `src/integration/`.
2. Create a new class in the created file that extends the `Integration` abstract class from `src/integration/base.ts`. It has the following abstract methods:
    - `isApplicable`: The integration will only be loaded on context where this returns true. Extend `SdkIntegration` instead to have this default to whether if current manifest has the required SDK extension.
    - `load`: This is called when loading your integration.
    - `unload`: This is called when unloading your integration. This is where you should put the cleanups.
3. The constructor needs the following parameters:
    - `extensionId`: The VSCode ID of the extension you are integrating.
    - `sdkExtension`: For which SDK Extension should it be enabled. If it doesn't exist, update `Manifest.sdkExtensions` method in `src/manifest.ts`. This is only needed when extending `SdkIntegration`.
4. Don't forget to append an instance of your class to `INTEGRATIONS` in `src/integration/index.ts`.
5. You can also add documentations for your integration in `README.md`.
