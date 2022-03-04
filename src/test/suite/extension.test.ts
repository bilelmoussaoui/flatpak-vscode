import * as assert from 'assert'
import { Uri } from 'vscode'
import { resolve } from 'path'
import { isValidDbusName, parseManifest } from '../../manifestUtils'
import { versionCompare } from '../../flatpakUtils'
import { exists, generatePathOverride } from '../../utils'

function intoUri(path: string): Uri {
    return Uri.file(resolve(__dirname, path))
}

suite('manifestUtils', () => {
    test('parseManifest', async () => {

        async function assertValidManifest(path: string): Promise<void> {
            const manifest = await parseManifest(intoUri(path))
            assert.notEqual(manifest, null)
            assert.equal(manifest?.manifest['app-id'], 'org.valid.Manifest')
            assert.equal(manifest?.manifest.runtime, 'org.gnome.Platform')
            assert.equal(manifest?.manifest['runtime-version'], '41')
            assert.equal(manifest?.manifest.sdk, 'org.gnome.Sdk')
            assert.equal(manifest?.manifest.command, 'app')
            assert.equal(manifest?.manifest.modules[0].name, 'app')
            assert.equal(manifest?.manifest.modules[0].buildsystem, 'meson')
            assert.equal(manifest?.requiredVersion, '1.12.5')
            assert(!manifest?.finishArgs().map((arg) => arg.split('=')[0]).includes('--require-version'))
            assert(!manifest?.finishArgs().map((arg) => arg.split('=')[0]).includes('--metadata'))
        }

        async function assertInvalidManifest(path: string): Promise<void> {
            const manifest = await parseManifest(intoUri(path))
            assert.equal(manifest, null)
        }

        await assertValidManifest('../assets/org.valid.Manifest.json')
        await assertValidManifest('../assets/org.valid.Manifest.jsonc')
        await assertValidManifest('../assets/org.valid.Manifest.yaml')
        await assertValidManifest('../assets/org.valid.Manifest.yml')

        await assertInvalidManifest('../assets/.has.invalid.AppId.yml')
        await assertInvalidManifest('../assets/has.missing.Modules.json')
        await assertInvalidManifest('../assets/has.missing.AppId.json')
    })

    test('isValidDbusName', () => {
        assert(
            isValidDbusName('_org.SomeApp'),
        )
        assert(
            isValidDbusName('com.org.SomeApp'),
        )
        assert(
            isValidDbusName('com.org_._SomeApp'),
        )
        assert(
            isValidDbusName('com.org-._SomeApp'),
        )
        assert(
            isValidDbusName('com.org._1SomeApp'),
        )
        assert(
            isValidDbusName('com.org._1_SomeApp'),
        )
        assert(
            isValidDbusName('VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.a111111111111'),
        )

        assert(
            !isValidDbusName('package'),
            'DBus name must contain at least two elements'
        )
        assert(
            !isValidDbusName('NoDot'),
            'DBus name must contain at least two elements'
        )
        assert(
            !isValidDbusName('No-dot'),
            'DBus name must contain at least two elements'
        )
        assert(
            !isValidDbusName('No_dot'),
            'DBus name must contain at least two elements'
        )
        assert(
            !isValidDbusName('Has.Two..Consecutive.Dots'),
            'DBus name elements must have at least one valid character'
        )
        assert(
            !isValidDbusName('HasThree...Consecutive.Dots'),
            'DBus name elements must have at least one valid character'
        )
        assert(
            !isValidDbusName('.StartsWith.A.Period'),
            'DBus name must not start with a period'
        )
        assert(
            !isValidDbusName('.'),
            'DBus name must not start with a period'
        )
        assert(
            !isValidDbusName('Ends.With.A.Period.'),
            'DBus name must not end with a period'
        )
        assert(
            !isValidDbusName('0P.Starts.With.A.Digit'),
            'DBus name must not start with a digit'
        )
        assert(
            !isValidDbusName('com.org.1SomeApp'),
            'DBus name element must not start with a digit'
        )
        assert(
            !isValidDbusName('Element.Starts.With.A.1Digit'),
            'DBus name element must not start with a digit'
        )
        assert(
            !isValidDbusName('VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.VeryLongApplicationId.a1111111111112'),
            'DBus name must have less than or equal 255 characters'
        )
        assert(
            !isValidDbusName(''),
            'DBus name must not be empty'
        )
        assert(
            !isValidDbusName('contains.;nvalid.characters'),
            'The characters must only contain a-z, A-Z, periods, or underscores'
        )
        assert(
            !isValidDbusName('con\nins.invalid.characters'),
            'The characters must only contain a-z, A-Z, periods, or underscores'
        )
        assert(
            !isValidDbusName('con/ains.invalid.characters'),
            'The characters must only contain a-z, A-Z, periods, or underscores'
        )
        assert(
            !isValidDbusName('conta|ns.invalid.characters'),
            'The characters must only contain a-z, A-Z, periods, or underscores'
        )
        assert(
            !isValidDbusName('contæins.inva_å_lid.characters'),
            'The characters must only contain a-z, A-Z, periods, or underscores'
        )
    })
})

suite('flatpakUtils', () => {
    test('versionCompare', () => {
        assert(versionCompare('1.12.5', '1.12.0'))
        assert(versionCompare('1.8.5', '1.2.0'))
        assert(versionCompare('0.9.2', '0.9.2'))

        assert(!versionCompare('1.12.5', '1.19.0'))
        assert(!versionCompare('1.0.0', '1.2.0'))
        assert(!versionCompare('0.9.2', '1.2.0'))
    })
})

suite('manifest', () => {
    test('x-run-args', async () => {
        const manifest = await parseManifest(intoUri('../assets/org.gnome.Screenshot.json'))
        assert.deepEqual(manifest?.manifest['x-run-args'], ['--interactive'])

        const runCommand = manifest?.run()
        assert(runCommand?.toString().endsWith('gnome-screenshot --interactive'))
    })
})

suite('utils', () => {
    test('generatePathOverride', () => {
        assert.equal(generatePathOverride('/a/a:/b/b', [], []), '/a/a:/b/b')
        assert.equal(generatePathOverride('/a/a:/b/b', ['', ''], ['']), '/a/a:/b/b')
        assert.equal(generatePathOverride('/a/a:/b/b', ['/c/c', ''], ['', '/d/d']), '/c/c:/a/a:/b/b:/d/d')
        assert.equal(generatePathOverride('', [''], ['']), '')
        assert.equal(generatePathOverride('', ['/b/b'], ['/c/c']), '/b/b:/c/c')
        assert.equal(generatePathOverride('', ['/b/b', '/d/d'], ['/c/c', '/e/e']), '/b/b:/d/d:/c/c:/e/e')
        assert.equal(generatePathOverride('/a/a', [], ['/c/c']), '/a/a:/c/c')
        assert.equal(generatePathOverride('/a/a', ['/b/b'], []), '/b/b:/a/a')
        assert.equal(generatePathOverride('/a/a', ['/b/b'], ['/c/c']), '/b/b:/a/a:/c/c')
        assert.equal(generatePathOverride('/a/a', ['/b/b', '/d/d'], ['/c/c', '/e/e']), '/b/b:/d/d:/a/a:/c/c:/e/e')
        assert.equal(generatePathOverride('/a/a:/f/f', ['/b/b', '/d/d'], ['/c/c', '/e/e']), '/b/b:/d/d:/a/a:/f/f:/c/c:/e/e')
    })

    test('exists', async () => {
        assert(await exists(intoUri('../assets/org.valid.Manifest.json').fsPath))
        assert(!await exists(intoUri('../assets/sOmE.nOnExistenT.FilE.abc').fsPath))
    })
})
