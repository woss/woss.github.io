## How to batch the transactions

First of all the chain must have the `pallet-utility` installed and `runtime/src/lib.rs` properly configured.

```toml
# runtime/Cargo.toml
[dependencies.pallet-utility]
default-features = false
version = '2.0.0-alpha.4'


[features]
default = ['std']
std = [
  #...
  'pallet-utility/std',
  # ...
]

```

```rust
// runtime/src/lib.rs

pub const MILLICENTS: Balance = 1_000_000_000;
pub const CENTS: Balance = 1_000 * MILLICENTS;

parameter_types! {
  // One storage item; value is size 4+4+16+32 bytes = 56 bytes.
  pub const MultisigDepositBase: Balance = 30 * CENTS;
  // Additional storage item size of 32 bytes.
  pub const MultisigDepositFactor: Balance = 5 * CENTS;
  pub const MaxSignatories: u16 = 100;
}

impl pallet_utility::Trait for Runtime {
  type Event = Event;
  type Call = Call;
  type Currency = Balances;
  type MultisigDepositBase = MultisigDepositBase;
  type MultisigDepositFactor = MultisigDepositFactor;
  type MaxSignatories = MaxSignatories;
}
construct_runtime!(
  pub enum Runtime where
    Block = Block,
    NodeBlock = opaque::Block,
    UncheckedExtrinsic = UncheckedExtrinsic
  {
    //...
    Utility: pallet_utility::{Module, Call, Storage, Event<T>}
  }
);

```

`cargo check && cargo build`

After that try and see in JS app this kind of code will work:

```js
/**
 * Create Default Ops
 * @param api
 * @param signer
 */
export async function createDefaultOps(api, signer) {
  const ops = api.consts.poe.defaultOperations;
  const txs = ops.map((op) => api.tx.poe.createDefaultOp(op));

  return api.tx.utility.batch(txs).signAndSend(signer, {}, ({ status }) => {
    console.log(`\tTransaction status:${status.type}`);
  });
}
```

## On retrieving single / multiple records from the storage in

UI is typescript backend substrate based chain written in rust.

```ts
// single
await api.query.poe.proofs(proofId);

// multiple
// this is faster than single
await api.query.poe.proofs.multi([proofId1, proofId2]);

// all
await api.query.poe.proofs.entries();
```

**NOTE** Key retrieval is very heavy
