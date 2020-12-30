import { FlatpakManifest, Module } from './flatpak.types'
import { Command } from './terminal'
import { getuid } from 'process'

export const getBuildAppCommand = (
  module: Module,
  cwd: string,
  buildDir: string,
  buildArgs: string[],
  isSandboxed: boolean
): [Command[], Command[]] => {
  let buildAppCommand: Command[] = []
  let rebuildAppCommand: Command[] = []
  const configOpts = (module['config-opts'] || []).join(' ')

  switch (module.buildsystem) {
    case 'meson':
      {
        const mesonBuildDir = '_build'
        buildArgs.push(`--filesystem=${cwd}/${mesonBuildDir}`)
        rebuildAppCommand = [
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'ninja',
            '-C',
            mesonBuildDir,
          ], cwd, isSandboxed),
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            'install',
            '-C',
            mesonBuildDir,
          ], cwd, isSandboxed),
        ]

        buildAppCommand = [
          new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            'meson',
            '--prefix',
            '/app',
            mesonBuildDir,
            configOpts,
          ], cwd, isSandboxed),
          ...rebuildAppCommand,
        ]
      }
      break
    case 'simple':
      {
        const buildCommands = module['build-commands'].map((command) => {
          return new Command('flatpak', [
            'build',
            ...buildArgs,
            buildDir,
            command,
          ], cwd, isSandboxed)
        })
        rebuildAppCommand = buildCommands
        buildAppCommand = buildCommands
      }
      break
  }
  return [buildAppCommand, rebuildAppCommand]
}

export const exportBundle = (): Command => {
  return new Command('flatpak-builder', [])
}

export const buildDependencies = (manifestPath: string, buildDir: string, cwd: string, isSandboxed: boolean, stateDir?: string, stopAt?: string): Command => {
  const args = [
    '--ccache',
    '--force-clean',
    '--disable-updates',
    '--disable-download',
    '--build-only',
    '--keep-build-dirs',
  ]
  if (stateDir) {
    args.push(`--state-dir=${stateDir}`)
  }
  if (stopAt) {
    args.push(`--stop-at=${stopAt}`)
  }
  args.push(buildDir)
  args.push(manifestPath)

  return new Command('flatpak-builder', args, cwd, isSandboxed)
}

export const updateDependencies = (manifestPath: string, buildDir: string, cwd: string, isSandboxed: boolean, stateDir?: string, stopAt?: string): Command => {
  const args = [
    '--ccache',
    '--force-clean',
    '--disable-updates',
    '--download-only',
  ]
  if (stateDir) {
    args.push(`--state-dir=${stateDir}`)
  }
  if (stopAt) {
    args.push(`--stop-at=${stopAt}`)
  }
  args.push(buildDir)
  args.push(manifestPath)
  return new Command(
    'flatpak-builder',
    args,
    cwd,
    isSandboxed
  )
}

export const buildInit = (manifest: FlatpakManifest, buildDir: string, cwd: string, isSandboxed: boolean): Command => {
  const appId = manifest['app-id'] || manifest.id || 'org.flatpak.Test'
  return new Command(
    'flatpak',
    [
      'build-init',
      buildDir,
      appId,
      manifest.sdk,
      manifest.runtime,
      manifest['runtime-version'],
    ],
    cwd,
    isSandboxed
  )
}

export const run = (
  manifest: FlatpakManifest,
  buildDir: string,
  cwd: string,
  isSandboxed: boolean,
): Command => {
  const appId = manifest['app-id'] || manifest.id || 'org.flatpak.Test'
  const uid = getuid()
  const finishArgs = manifest['finish-args']
    .filter((arg) => {
      // --metadata causes a weird issue
      return arg.split('=')[0] !== '--metadata'
    })
    .map((arg) => {
      if (arg.endsWith('*')) {
        const [key, value] = arg.split('=')
        return `${key}='${value}'`
      }
      return arg
    })

  return new Command(
    'flatpak',
    [
      'build',
      '--with-appdir',
      '--allow=devel',
      `--bind-mount=/run/user/${uid}/doc=/run/user/${uid}/doc/by-app/${appId}`,
      ...finishArgs,
      "--talk-name='org.freedesktop.portal.*'",
      '--talk-name=org.a11y.Bus',
      buildDir,
      manifest.command,
    ],
    cwd,
    isSandboxed,
  )
}
