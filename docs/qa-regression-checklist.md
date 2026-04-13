# QA Regression Checklist

## Progression And Submission

- [ ] Cannot clear a stage when `pendingFlagVerification` is null, even with `SN-MS-0x`.
- [ ] Can clear a stage only after ARIA success email creates pending confirmation.
- [ ] Reply/Submit with wrong phrase returns incorrect status and does not unlock.

## Mission Gating And Timer

- [ ] Sending payload to `aria@...` is blocked before mission acceptance.
- [ ] At `00:00`, mission expires, pending verification is cleared, and retry briefing mail appears.
- [ ] After timeout, player must accept mission again before sending payload.

## Dify And Local Arbitration

- [ ] When Dify returns valid result, success follows `result.is_hacked` only.
- [ ] When Dify is unavailable/error, local validation fallback still runs.
- [ ] Malformed Dify output missing required fields is rejected by `/api/aria`.

## Stage Validators

- [ ] Stage 2 requires hidden marker + directive + stronger phrase.
- [ ] Stage 3 requires document context + directive + minimum body size.
- [ ] Stage 4 requires DailyFresh trusted marker + order shape + special instructions + directive.

## Prompt Consistency

- [ ] `docs/systemprompt/stage1.md`..`stage4.md` all target Minnie.
- [ ] Prompt copy avoids meta security wording and keeps in-character style.
- [ ] Stage 4 trusted-source wording matches accepted vendor markers.
