## How to debug pallet like console.log

Sometimes you just need that `console.log` thing in the substrate based pallet. Here is how i solved the issue, not the prettiest way but it works.

```rust
use sp_runtime::{traits::Hash, RuntimeDebug};

/// PoE Proof
#[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug)]
// #[cfg_attr(feature = "std", derive(Debug))]
pub struct Proof {
  id: Vec<u8>,   // hexEncode(cid(body))
  body: Vec<u8>, // this is generic now, a string, make it GENERIC rust way.
  created_at: u64,
  prev: Vec<u8>,
  rule_id: Vec<u8>, // which rule is executed
  for_what: ForWhat,
}


// The pallet's dispatchable functions.
decl_module! {
    /// The module declaration.
    pub struct Module<T: Trait> for enum Call where origin: T::Origin {
       /// Create proof and claim
        fn create_proof(origin, proof: Proof) {
          // ... stuff

          native::info!("My proof in bytes: {:?}", proof);
          native::info!("My proof_id: {}", proof.id);

          // ... more stuff
        }
    }
}

```
