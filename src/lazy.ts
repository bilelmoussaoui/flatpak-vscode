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

export class AsyncLazy<T> {
    private readonly factory: () => Promise<T>
    private value: T | undefined

    constructor(factory: () => Promise<T>) {
        this.factory = factory
        this.value = undefined
    }

    /**
     * Returns the cached value or initialize first.
     */
    async get(): Promise<T> {
        if (this.value === undefined) {
            this.value = await this.factory()
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
