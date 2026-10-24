import mongoose from 'mongoose';

/**
 * Atomic sequence counters.
 *
 * Used to mint collision-free human-readable identifiers. `findOneAndUpdate`
 * with `$inc` is atomic at the document level in MongoDB, so concurrent writers
 * are each handed a distinct value — unlike random generation, which collides.
 */
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },   // e.g. 'order:ON'
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Returns the next value in the named sequence, creating it if absent.
 * Sequences start at 100000 to stay clear of the legacy 4-digit ids.
 */
export const nextSequence = async (name, startAt = 100000) => {
    let doc;
    try {
        doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    } catch (error) {
        // Two first users of a sequence can race the initial upsert. The _id
        // unique index chooses the winner; the loser still needs its own increment.
        if (error.code !== 11000) throw error;
        doc = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true });
    }
    return startAt + doc.seq;
};

export default Counter;
