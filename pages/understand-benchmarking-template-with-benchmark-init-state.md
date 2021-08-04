# Understand benchmarking template with benchmark init state

Lately i've been reseraching and implementing the benchmarking simple pallets for [Anagolay Network](https://anagolay.dev).

For the given part of the template :

```handlebars
/// Weight functions needed for {{pallet}}.
pub trait WeightInfo {
  {{~#each benchmarks as |benchmark|}}
  fn {{benchmark.name~}}
  (
    {{~#each benchmark.components as |c| ~}}
    {{c.name}}: u32, {{/each~}}
  ) -> Weight;
  {{~/each}}
}
```

the `benchmark.components` are the parameters that are passed into the execution of the benchmark like this or the variables that the input depends on ( especially if they are ranges ).

```rs
benchmarks! {
    create_rule {
        let n in 1 .. 1000;
        let caller: T::AccountId = whitelisted_caller();
    }: _(RawOrigin::Signed(caller), Rule {
        id: vec![n as u8],
        data: RuleData::default(),
    })
}
```

given the correct cli command with the template this will generate the struct like this:

```rs
/// Weight functions needed for an_rules.
pub trait WeightInfo {
	fn create_rule(n: u32, ) -> Weight;
}
impl<T: frame_system::Config> WeightInfo for AnagolayWeight<T> {
	fn create_rule(n: u32, ) -> Weight {
		(31_383_000 as Weight)
			// Standard Error: 0
			.saturating_add((3_000 as Weight).saturating_mul(n as Weight))
			.saturating_add(T::DbWeight::get().reads(2 as Weight))
			.saturating_add(T::DbWeight::get().writes(2 as Weight))
	}
}
```

The thing is that the `n` is not directly making the extrinsic call any longer no matter the size. This is the bad way of implementing the benchmark. The implementation of the extrinsic does not contain `for loop` or anything similar, it takes in the data, does some checks and then formats the data and saves it.

The template will generate the trait correctly, because it thinks that the `n` which is passed in the exec call `id: vec![n as u8],` part of the actual extrinsic but it's not. It should not be, since the extrinsic does not have it as a parameter.

Here is the extrinsic call implementation:

```rs
  #[pallet::call]
  impl<T: Config> Pallet<T> {
    /// Create Rule
    #[pallet::weight(<T as Config>::WeightInfo::create_rule(255,))] // << this is wrong, it should not accept anything
    pub(super) fn create_rule(origin: OriginFor<T>, rule: Rule) -> DispatchResultWithPostInfo {
      let sender = ensure_signed(origin)?;
      let current_block = <frame_system::Pallet<T>>::block_number();

      ensure!(
        !Rules::<T>::contains_key(&rule.id, &sender),
        Error::<T>::RuleAlreadyCreated
      );

      let rule_info = Self::create(&sender, &current_block, &rule);

      // deposit the event
      Self::deposit_event(Event::RuleCreated(sender, rule_info.rule.id.clone()));

      Ok(().into())
    }
  }
```

After re-reading the docs, re-watching the videos and cross referencing the various pallets from various substrate projects, it made sense. The range is not needed unless it is used to simulate the parameter that has effect on the extrinsic.

To make this work here are the changes needed in order this simple extrinsic to work as it should.

Remove the range from benchmark and assign some meaningful value if needed:

```rs
benchmarks! {
    create_rule {
        let caller: T::AccountId = whitelisted_caller();
        let rule = Rule {
            id: vec![1],
            data: RuleData::default(),
        };
    }: _(RawOrigin::Signed(caller), rule)
}
```

This will generate the WeightInfo struct without the `n` param without changing the template:

```rs
/// Weight functions needed for an_rules.
pub trait WeightInfo {
	fn create_rule() -> Weight;
}

/// Weights for an_rules using the Substrate node and recommended hardware.
pub struct AnagolayWeight<T>(PhantomData<T>);
impl<T: frame_system::Config> WeightInfo for AnagolayWeight<T> {
	fn create_rule() -> Weight {
		(33_700_000 as Weight)
			.saturating_add(T::DbWeight::get().reads(2 as Weight))
			.saturating_add(T::DbWeight::get().writes(2 as Weight))
	}
}
```

and then in the implementation you need to remove the `255`:

```rs

  #[pallet::call]
  impl<T: Config> Pallet<T> {
    /// Create Rule
    #[pallet::weight(<T as Config>::WeightInfo::create_rule())]
    pub(super) fn create_rule(origin: OriginFor<T>, rule: Rule) ->
    // ... the rest is the same

```

That's it. I hope i understood this correctly and you did too. If you think this is wrong, please contact me on [Twitter](https://twitter.io/woss_io) or create an issue https://github.com/woss/woss.github.io
