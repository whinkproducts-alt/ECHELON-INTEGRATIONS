# Lane C1 notes
- Providers are rows in `provider-catalog.ts`; keys: env `<ENV>_API_KEY` or encrypted `user_api_keys` provider `model:<id>` (no migration needed).
- Prices are never invented: set `WHINK_MODEL_PRICES` with keys `<providerId>/<model>` (USD micros per token). Unset = UNKNOWN_PRICE.
- Admission is unchanged; calls pass `costClass: 'metered'` and explicit price, so G1a's admission.ts is untouched.
- Lead to wire: messages route should use `providerChatOnce` (via `chatWithFailover`) for `provider: 'cloud'` registry entries, pass `storedProviders` (`storedProviderIds`) to `planRoute`, and `getQwenAccessToken` as `qwenToken`. An import endpoint for `importQwenLogin` is also needed (outside lib/model-router).
- Base URLs are from memory of public docs: verify on first live call.
