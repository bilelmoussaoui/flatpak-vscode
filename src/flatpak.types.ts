import { PathLike } from 'fs'

export interface ManifestSchema {
    id?: string
    branch?: string
    'app-id'?: string
    modules: Module[]
    sdk: string
    runtime: string
    'runtime-version': string
    'sdk-extensions'?: string[]
    command: string
    'finish-args'?: string[]
    'build-options'?: BuildOptions
    'x-run-args'?: string[]
}

export type BuildOptionsPathKeys = 'append-path' | 'prepend-path' |
    'append-ld-library-path' |
    'prepend-ld-library-path' |
    'append-pkg-config-path' |
    'prepend-pkg-config-path'

export interface BuildOptions {
    'build-args': string[]
    'append-path'?: PathLike
    'prepend-path'?: PathLike
    'append-ld-library-path'?: PathLike
    'prepend-ld-library-path'?: PathLike
    'append-pkg-config-path'?: PathLike
    'prepend-pkg-config-path'?: PathLike
    env: Record<string, string>
    'config-opts': string[]
}

export type BuildSystem = 'meson' | 'cmake' | 'cmake-ninja' |
    'simple' | 'autotools' | 'qmake'

export interface Module {
    name: string
    buildsystem?: BuildSystem
    'config-opts'?: string[]
    sources: Source[]
    'build-commands': string[]
    'build-options'?: BuildOptions
    'post-install'?: string[]
}

export type SourceType = 'archive' | 'git' |
    'bzr' | 'svn' | 'dir' | 'file' |
    'script' | 'inline' | 'shell' |
    'patch' | 'extra-data'

export interface Source {
    type: SourceType
    url?: URL
    path?: PathLike
    tag?: string
    commit?: string
    sha256?: string
}

export type SdkExtension = 'vala' | 'rust'
