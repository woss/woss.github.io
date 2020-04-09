# On saving the TX in substrate

[doc](https://polkadot.js.org/api/start/api.rpc.html)

From the docs:

> Any transaction will emit events, as a bare minimum this will always be either a `system.ExtrinsicSuccess` or `system.ExtrinsicFailed` event for the specific transaction. These provide the overall execution result for the transaction, i.e. execution has succeeded or failed.

And

> Be aware that when a transaction status is `isFinalized`, it means it is included, but it may still have failed - for instance if you try to send a larger amount that you have free, the transaction is included in a block, however from a end-user perspective the transaction failed since the transfer did not occur. In these cases a `system.ExtrinsicFailed` event will be available in the events array.

Which means that the event of `isFinalized` will be triggered and you will get the green light, but the TX is failed.

Code sample from SensioNetwork:

```ts
async function createTX(
  api: ApiPromise,
  { payload, ruleId }: { ruleId: string; payload: string },
  signer: KeyringPair,
): Promise<void> {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    console.log(`\nCreating TX for the ruleId: ${hexToString(ruleId)}`);
    const unSubscribe = await api.tx.poeModule
      .createRule(ruleId, payload)
      .signAndSend(signer, {}, ({ events = [], status, isError }) => {
        console.log(`\rTransaction status:${status.type}`);

        if (status.isInBlock) {
          console.log('\rIncluded at block hash', status.asInBlock.toHex());

          console.log('\nEvents:', events.length);

          events.forEach(({ event, phase }) => {
            const { data, method, section } = event;

            console.log('\r', phase.toString(), `: ${section}.${method}`, data.toString());

            if (method === 'ExtrinsicFailed') {
              data.forEach((d) => console.log(d.toString()));
              unSubscribe();
              console.log('\rRejecting ...');
              // reject here would make all the other promises to fail
              resolve('ExtrinsicFailed');
            } else {
              console.log('\r', phase.toString(), `: ${section}.${method}`, data.toString());
            }
          });
        } else if (status.isFinalized) {
          console.log('\rFinalized block hash', status.asFinalized.toHex());
          unSubscribe();
          resolve();
        } else if (isError) {
          console.error(status);
        }
      })
      .catch(reject);
  });
}
```
