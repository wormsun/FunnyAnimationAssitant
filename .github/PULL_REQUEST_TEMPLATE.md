# Summary

What changed, and why?

## Verification

Please run the relevant checks before requesting review:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run release:audit`

If a command cannot run in your environment, explain why.

## Scope

- [ ] This PR does not add login, VIP, payment, cloud sync, or private backend logic.
- [ ] This PR does not include secrets, tokens, certificates, private deployment config, or internal documents.
- [ ] New assets, fonts, audio, video, or templates have clear redistribution rights and are documented in `NOTICE` or a related README.

## Risk

Does this affect project file format, export output, material paths, or TTS behavior?
