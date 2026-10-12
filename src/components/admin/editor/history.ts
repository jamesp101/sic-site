/** Linear undo/redo history. Snapshots are immutable values; rapid edits sharing a `key` collapse into one step. */
export class History<T> {
    #past: T[] = [];
    #future: T[] = [];
    #present: T;
    #key: string | null = null;
    #at = 0;

    constructor(
        initial: T,
        private readonly limit = 200,
        private readonly windowMs = 800,
    ) {
        this.#present = initial;
    }

    get present(): T {
        return this.#present;
    }

    get canUndo(): boolean {
        return this.#past.length > 0;
    }

    get canRedo(): boolean {
        return this.#future.length > 0;
    }

    /** Records a new state. With the same `key` as the previous push within the time window the step is merged. */
    push(next: T, key: string | null = null, now = Date.now()): void {
        if (next === this.#present) return;
        const merge = key !== null && key === this.#key && now - this.#at < this.windowMs && this.#past.length > 0;
        if (!merge) {
            this.#past.push(this.#present);
            if (this.#past.length > this.limit) this.#past.shift();
        }
        this.#present = next;
        this.#future = [];
        this.#key = key;
        this.#at = now;
    }

    undo(): T | null {
        const previous = this.#past.pop();
        if (previous === undefined) return null;
        this.#future.push(this.#present);
        this.#present = previous;
        this.#key = null;
        return previous;
    }

    redo(): T | null {
        const next = this.#future.pop();
        if (next === undefined) return null;
        this.#past.push(this.#present);
        this.#present = next;
        this.#key = null;
        return next;
    }
}
