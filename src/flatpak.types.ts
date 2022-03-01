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
  'finish-args': string[]
  'build-options'?: BuildOptions,
  'x-run-args'?: string[],
}

export type BuildOptionsPathKeys = 'append-path' | 'prepend-path' |
  'append-ld-library-path' |
  'prepend-ld-library-path' |
  'append-pkg-config-path' |
  'prepend-pkg-config-path'

export interface BuildOptions {
  'build-args': string[],
  'append-path'?: string,
  'prepend-path'?: string,
  'append-ld-library-path'?: string,
  'prepend-ld-library-path'?: string,
  'append-pkg-config-path'?: string,
  'prepend-pkg-config-path'?: string,
  env: Record<string, string>,
  'config-opts': string[],
}

export interface Module {
  name: string
  buildsystem?: string
  'config-opts': string[]
  sources: Source[]
  'build-commands': string[]
  'build-options'?: BuildOptions,
}

export interface Source {
  type: string
  url?: string
  path?: string
  tag?: string
  commit?: string
  sha256?: string
}
