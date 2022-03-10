pkgdatadir = join_paths(get_option('prefix'), get_option('datadir'), meson.project_name())
moduledir = join_paths(pkgdatadir, 'meson')

python = import('python')

conf = configuration_data()
conf.set('PYTHON', python.find_installation('python3').path())
conf.set('VERSION', meson.project_version())
conf.set('pkgdatadir', pkgdatadir)

configure_file(
  input: 'meson.in',
  output: 'meson',
  configuration: conf,
  install: true,
  install_dir: get_option('bindir')
)

meson_sources = [
  '__init__.py',
  'main.py',
]

install_data(meson_sources, install_dir: moduledir)
