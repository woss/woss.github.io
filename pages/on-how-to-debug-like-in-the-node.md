## On How to debug like in the node

Seems like there IS a way to debug the WASM runtimes. According to this [link](https://substrate.dev/rustdocs/master/frame_support/debug/native/index.html) following code will produce the logs.

```rust
use frame_support::debug::native;

// ...

fn create_rule_simple ( origin, rule_cid: Vec<u8>, payload: Vec<u8>) {
    let sender = ensure_signed(origin)?;

    ensure!(!Rules::contains_key(&rule_cid), Error::<T>::RuleAlreadyCreated);
    native::info!("My struct: {:?}", payload);
    let proof = Rule::decode(&mut &payload[..]);
    native::info!("My struct: {:?}", proof);
    Self::deposit_event(RawEvent::RuleCreated(sender, rule_cid));
}

```
