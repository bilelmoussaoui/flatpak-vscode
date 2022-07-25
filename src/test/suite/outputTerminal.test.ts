import * as assert from 'assert'
import * as vscode from 'vscode'
import { OutputTerminal } from '../../outputTerminal'
import { Command } from '../../command'

suite('dimensions', () => {
    test('synced IPty and OutputTerminal dimensions', async () => {
        const outputTerminal = new OutputTerminal()
        await outputTerminal.show()

        const command = new Command('echo', ['Hello, world!'])
        const iPty = await command.spawn(outputTerminal, (new vscode.CancellationTokenSource).token)
        assert.equal(outputTerminal.dimensions?.columns, iPty.cols)
        assert.equal(outputTerminal.dimensions?.rows, iPty.rows)
    })

    test('initially unsynced IPty and OutputTerminal dimensions', async () => {
        const outputTerminal = new OutputTerminal()

        const command = new Command('echo', ['Hello, world!'])
        const iPty1 = await command.spawn(outputTerminal, (new vscode.CancellationTokenSource).token)
        // Since outputTerminal is not shown, it should have undefined dimensions.
        // Thus, it should not affect the dimensions of iPty1.
        assert.equal(outputTerminal.dimensions, undefined)

        await outputTerminal.show()

        const iPty2 = await command.spawn(outputTerminal, (new vscode.CancellationTokenSource).token)
        assert.equal(outputTerminal.dimensions?.columns, iPty2.cols)
        assert.equal(outputTerminal.dimensions?.rows, iPty2.rows)

        // Since the outputTerminal is already shown. It should
        // affect the dimensions of iPty2, and differ from iPty1.
        assert.notEqual(iPty1.cols, iPty2.cols)
        assert.notEqual(iPty1.rows, iPty2.rows)
    })
})
