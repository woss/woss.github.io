## On Hasher

Which hash method to use when using `hasher($hash)` ion `decl_storage!`

any particular reason to use `blake2_128_concat` over `opaque_blake2_256`? is it because it's smaller?

no, because `*_concat` appends to the end of the storage key your actual key, as raw bytes. This allows you to know what the key is for that storage item, where as `opaque_blake2_256` would just be a hash of the key, and you would only be able to know what the key is if you knew already and checked the hash.

[useful Link](https://github.com/paritytech/substrate/blob/c34e0641abe52249866b62fdb0c2aeed41903be4/frame/support/procedural/src/lib.rs#L73)
