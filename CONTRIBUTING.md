# Contributing

## Flatpaked VSCodium / Visual Studio Code

1. Install the node12 extension by executing
```
flatpak install flathub org.freedesktop.Sdk.Extension.node12
```
Note: It will suggest multiple versions. To be sure which one to use, check the manifest in the flathub repo of [VSCodium](https://github.com/flathub/com.vscodium.codium/blob/master/com.vscodium.codium.yaml) / [Visual Studio Code](https://github.com/flathub/com.visualstudio.code/blob/master/com.visualstudio.code.yaml).

2. Enable it by adding the following line to ~/.bash_profile
```
export FLATPAK_ENABLE_SDK_EXT=node12
```

3. Log out and in again

4. Open the `flatpak-vscode` repo with your editor

5. Within the integrated terminal of your editor, execute at the root of the repository
```
npm install --global yarn
yarn install
```

6. To start debugging, run `F5`

## Directly installed VSCodium / Visual Studio Code

1. Install `yarn` with your preferred method and make sure it is in your PATH

2. Execute at the root of the repository
```
yarn install
```

3. To start debugging, run `F5`
