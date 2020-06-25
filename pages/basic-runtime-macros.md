## Basic Runtime macros

### decl_module

When you need an on-chain modification, it doesn't work like an classic API would work. There is no way to change the default return signature which is atm `pub type DispatchResult = sp_std::result::Result<(), DispatchError>;`

[src](https://substrate.dev/rustdocs/v2.0.0-alpha.3/src/frame_support/dispatch.rs.html#207-1482)
[doc](https://substrate.dev/rustdocs/v2.0.0-alpha.3/frame_support/macro.decl_module.html)

### decl_storage

It's database for the runtime, each of the definitions can be considered as a table => column definition.
It is a storage and api for retrieving the record.
`Proofs: map hasher(blake2_128_concat) Vec<u8> => (T::AccountId, T::BlockNumber, u64);`

[src](https://substrate.dev/rustdocs/v2.0.0-alpha.3/src/frame_support_procedural/lib.rs.html#251-253)
[doc](https://substrate.dev/rustdocs/v2.0.0-alpha.3/frame_support/macro.decl_storage.html)

### decl_event

Event system that allows observers to get the notification on on-chain changes and resolve that to the actual values. For example it would be that a copyright is created on the chain then event is dispatched and all the
observers/listeners of the specific event will know that the copyright is created for that specific photo.

```rust

// The pallet's events
decl_event!(
    pub enum Event<T>
    where
        AccountId = <T as system::Trait>::AccountId,
    {
        /// Just a dummy event.
        /// Event `Something` is declared with a parameter of the type `u32` and `AccountId`
        /// To emit this event, we call the deposit function, from our runtime functions
        // SomethingStored(u32, AccountId),
        /// Event emitted when a proof has been claimed.
        ClaimCreated(AccountId, Vec<u8>),
        /// Event emitted when a claim is revoked by the owner.
        ClaimRevoked(AccountId, Vec<u8>),
    }
);
```

[src](https://substrate.dev/rustdocs/v2.0.0-alpha.3/src/frame_support/event.rs.html#102-149)

[doc](https://substrate.dev/rustdocs/v2.0.0-alpha.3/frame_support/macro.decl_event.html)
