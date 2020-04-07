## On Storing and accessing data

It is possible to get ALL the records of `Store` item declared in `decl_storage!`.

Let's take the following example:

```rust
// This pallet's storage items.
decl_storage! {
  trait Store for Module<T: Trait> as PoEModule
  {
    RulesSimple:  map hasher(blake2_128_concat) Vec<u8> => (T::AccountId, Vec<u8>);
  }
}

decl_module! {
  pub struct Module<T: Trait> for enum Call where origin: T::Origin {
    fn create_rule_simple ( origin, rule_cid: Vec<u8>, payload: Vec<u8>) {
      let sender = ensure_signed(origin)?;
      ensure!(!RulesSimple::<T>::contains_key(&rule_cid), Error::<T>::RuleAlreadyCreated);
      native::info!("My payload struct: {:?}", payload);
      RulesSimple::<T>::insert(&rule_cid, (sender.clone(), payload));
    }
  }
}
```

Accessing the ALL the data would be like this:

```ts
//  api is ApiPromise from @polkadot/api
interface RulePayloadValue extends Uint8Array {
  toHex: () => string;
}

interface StorageKey {
  [k: string]: {
    args: Uint8Array[];
  };
}

export async function getRules(api): Promise<void> {
  const c = (await api.query.poeModule.rulesSimple.entries()) as [StorageKey, [Uint8Array, RulePayloadValue]][];
  console.log(`FOUND ${c.length} rules`);
  c.forEach(([key, [accountId, payload]]) => {
    console.log('KEY: ', hexToString(key.args[0].toHex())); // Bytes !== String. So you need to convert.
    console.log('ACCOUNT ID: ', hexToString(accountId.toHex())); // Bytes === <length> + raw bytes
    console.log('VALUE: ', JSON.parse(hexToString(payload.toHex())));
  });
}
```
