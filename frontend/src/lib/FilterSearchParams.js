// JSON preserves option labels containing commas and other punctuation.
const encode = value => Array.isArray(value) ? JSON.stringify(value) : value;
export default class FilterSearchParams extends URLSearchParams {
    constructor(init) {
        super(init && Object.getPrototypeOf(init) === Object.prototype
            ? Object.fromEntries(Object.entries(init).map(([key, value]) => [key, encode(value)]))
            : init);
    }
    append(key, value) { super.append(key, encode(value)); }
    set(key, value) { super.set(key, encode(value)); }
}
