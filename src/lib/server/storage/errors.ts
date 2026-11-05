/** A `Range` that starts past the end of the object (or is empty); `size` is the object's total size. */
export class RangeNotSatisfiableError extends Error {
    constructor(readonly size: number) {
        super('Range not satisfiable');
        this.name = 'RangeNotSatisfiableError';
    }
}

/** An upload stream delivered more bytes than allowed. */
export class UploadTooLargeError extends Error {
    constructor(readonly maxBytes: number) {
        super(`The upload is larger than ${maxBytes} bytes.`);
        this.name = 'UploadTooLargeError';
    }
}
