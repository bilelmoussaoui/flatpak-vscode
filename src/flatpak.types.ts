export interface FlatpakManifestSchema {
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
  'build-options'?: BuildOptions
}

export interface BuildOptions {
  'append-path'?: string
  'build-args': string[]
  env: Record<string, string>
}

export interface Module {
  name: string
  buildsystem?: string
  'config-opts': string[]
  sources: Source[]
  'build-commands': string[]
}

export interface Source {
  type: string
  url?: string
  path?: string
  tag?: string
  commit?: string
  sha256?: string
}
