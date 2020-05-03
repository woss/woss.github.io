## On retrieving single / multiple records from the storage in

UI is typescript backend substrate based chain written in rust.

```ts
// single
await api.query.poe.proofs(proofId);

// multiple
await api.query.poe.proofs.multi([proofId1, proofId2]);

// all
await api.query.poe.proofs.entries();
```

**NOTE** Key retrieval is very heavy
