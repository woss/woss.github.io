## On How to decode stuff

The custom structs must be aadded to the Settings -> Developer tab following the conversion rules from RUST -> JSON as is said here <https://www.shawntabrizi.com/substrate-js-utilities/codec/> .

For Example our current `Rule` looks like this written in rust:

```rust

/// List of equipment that needs rules generated
#[derive(Encode, Decode)]
enum ForWhat {
    /// Any photo
    Photo = 0,
    /// Any camera, not a smartphone
    Camera = 1,
    /// Any Lens
    Lens = 2,
    /// Any Smartphone
    SmartPhone = 3,
}

/// Operations that will be performed
#[derive(Encode, Decode)]
struct RuleOperation {
    op: Vec<u8>,
    what: Vec<u8>,
    output: bool,
}

/// Rule which must be applied to the PoE
#[derive(Encode, Decode)]
struct Rule {
    name: Vec<u8>,
    for_what: ForWhat,
    version: u32,
    ops: Vec<RuleOperation>,
}

```

This in turn will be in JSON:

** NOTE **

I found out that having `"ops": "Vec<RuleOperation>"` definition in any other place than last breaks the parsing with the error `Number can only safely store up to 53 bits`, maybe it's accident, maybe not. Keep it last.

```json
[
  {
    "ForWhat": {
      "_enum": ["Photo", "Camera", "Lens", "SmartPhone"]
    }
  },
  {
    "RuleOperation": {
      "op": "Vec<u8>",
      "what": "Vec<u8>",
      "output": "bool"
    }
  },
  {
    "Rule": {
      "name": "Vec<u8>",
      "version": "u32",
      "for_what": "ForWhat",
      "ops": "Vec<RuleOperation>"
    }
  }
]
```

The latter is known as _Custom type definition_ and it's needed in order to process the encoded data. The creation of single rule looks like this written in rust:

```rust
 /// Rules for the PoE
const rule: Rule = Rule {
    name: b"rule 1".to_vec(),
    version: 1,
    for_what: ForWhat::Photo,
    ops: vec![
        RuleOperation {
            op: b"init".to_vec(),
            what: b"object".to_vec(),
            output: true
        }
    ]
};
// or without the ops

const rule: Rule = Rule {
    name: b"rule 1".to_vec(),
    version: 1,
    for_what: ForWhat::Photo,
    ops: vec![]
};
```

Now when we that explained let's decode the data. From Chain State -> Constants -> poeModule -> rule we will get something like this:

```js
{
  name: 0x72756c652031,
  version: 256,
  for_what: Photo,
  ops: [
    {
      op: 0x696e6974,
      what: 0x6f626a656374,
      output: true
    },
    {
      op: 0x726561645f6279746573,
      what: 0x696d616765,
      output: true
    },
    {
      op: 0x726561645f6d65746164617461,
      what: 0x696d616765,
      output: true
    }
  ]
}
```

It is fixed now, i'll leave this for the future.

**note as of time writing this polkadot js is bugged and it shows the wrong structure, take the value of the name and that is the encoded value**

```js
{
  name: 0x1872756c65203100010000000410696e6974186f626a65637401,
  version: 0,
  ops: []
}
```

take the value of the `name` field and past it in the _Raw Bytes_ field on this [website](https://www.shawntabrizi.com/substrate-js-utilities/codec/), _Custom Types_ is the definition from abobe.

Output of that should look something like this :

```json
{
  "name": "0x72756c652031",
  "version": 256,
  "for_what": "photo",
  "ops": [
    {
      "op": "0x696e6974",
      "what": "0x6f626a656374",
      "output": true
    }
  ]
}
```

where all `0x` values are HEX encoded and they can be decoded as simple as runnig `Buffer.from('6f626a656374', 'hex').toString();` === `'object'` in nodejs.

### Cheat Sheet

Enum
`{ "MyEnum": { "_enum": ["A", "B"] } }`

Tuple
`{ "MyTuple": "(u64, u64)" }`

Vector
`{ "MyVec": "Vec<u8>" }`

Advance Example
`[ { "MyEnum": { "_enum": ["A", "B", "C"] } }, { "MyPartA": "Vec<(MyEnum, u32)>" }, { "MyType": "(MyPartA, u128)" }, { "MyFinalType": "Vec<MyType>" } ]`
