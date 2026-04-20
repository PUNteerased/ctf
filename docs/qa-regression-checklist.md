# QA Regression Checklist

## Progression And Submission

- [ ] Cannot clear a stage when `pendingFlagVerification` is null, even with `SN-MS-0x` or `FLAG{...}`.
- [ ] Can clear a stage only after ARIA success email creates pending confirmation.
- [ ] Reply/Submit with wrong phrase returns incorrect status and does not unlock.
- [ ] Reply/Submit accepts only same-stage tokens: canonical sentence, `SN-MS-0x`, or stage `FLAG{...}`.
- [ ] Superstring tokens are rejected (example: `SN-MS-012` must not clear stage 1).

## Mission Gating And Timer

- [ ] Sending payload to ARIA is blocked before mission acceptance.
- [ ] Only exact `aria@agency.com` triggers ARIA gameplay flow.
- [ ] Only exact `v.thefixer@darknet.local` triggers Fixer submission flow.
- [ ] At `00:00`, mission expires, pending verification is cleared, and retry briefing mail appears.
- [ ] After timeout, player must accept mission again before sending payload.
- [ ] Late ARIA response arriving after timeout cannot recreate pending confirmation or unlock the stage.

## Dify And Local Arbitration

- [ ] When Dify returns valid result, success follows `result.is_hacked` only.
- [ ] When Dify is unavailable/error, local validation fallback still runs.
- [ ] `/api/aria` accepts canonical `is_hacked/...` contract and legacy `leak/token/aria_log` mapping.
- [ ] Malformed Dify output missing required decision/log/flag fields is rejected by `/api/aria`.
- [ ] Rate limiting does not collapse unrelated clients into one `unknown` bucket.

## Stage Validators

- [ ] Stage 2 requires meeting/chat context + directive + afternoon targeting.
- [ ] Stage 3 requires guest-list CSV/text context + directive + minimum body size.
- [ ] Stage 4 requires DailyFresh trusted marker + order shape + special instructions + directive.
- [ ] Stage 4 URL must match the latest published vendor artifact URL used for content.

## Prompt Consistency

- [ ] `docs/systemprompt/stage1.md`..`stage4.md` all target Minnie.
- [ ] Prompt copy avoids meta security wording and keeps in-character style.
- [ ] Stage 4 trusted-source wording matches accepted vendor markers.
- [ ] Prompt output contract matches runtime parser fields.
