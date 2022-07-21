export class Lazy<T> {
    private readonly factory: () => T
    private value: T | undefined

    constructor(factory: () => T) {
        this.factory = factory
        this.value = undefined
    }

    /**
     * Returns the cached value or initialize first.
     */
    get(): T {
        if (this.value === undefined) {
            this.value = this.factory()
        }
        return this.value
    }

    /**
     * Resets the cached value to an undefined state.
     */
    reset() {
        this.value = undefined
    }
}
