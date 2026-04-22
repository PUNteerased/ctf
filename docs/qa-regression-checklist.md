# QA Regression Checklist

## Manual Run (3 Stages End-To-End)

- [ ] เปิดเกมและกด `Power On` สำเร็จ เห็น desktop + mission panel
- [ ] เปิด `Email Client` ได้ และเห็น `Mission 1`
- [ ] Stage 1: กด `Accept Mission` แล้ว Compose → พิมพ์ `To/Subject/Body` → ส่งได้ และได้ ARIA reply
- [ ] Stage 1: นำ token (`SN-MS-01` หรือประโยคเต็ม) ไปกด `Submit` แล้วปลดไป `Mission 2`
- [ ] Stage 2: เปิด `Browser` โหมด `Text / .txt` → พิมพ์/วาง CSV → `Publish` สำเร็จ
- [ ] Stage 2: กลับ `Email Client` แนบ `Text` artifact แล้วส่งได้ ARIA reply
- [ ] Stage 2: `Submit` ด้วย token ด่าน 2 แล้วปลดไป `Mission 3`
- [ ] Stage 3: เปิด `Browser` โหมด `Vendor (DailyFresh)` → `Publish` แล้วได้ vendor URL
- [ ] Stage 3: กลับ `Email Client` แนบ `URL` เดียวกันแล้วส่งได้ ARIA reply
- [ ] Stage 3: `Submit` ด้วย token ด่าน 3 แล้วเห็นสถานะเคลียร์ครบ

## Bug Capture (ระหว่างเทสแมนนวล)

- [ ] จด **Environment**: branch, browser, วันเวลา, commit
- [ ] ถ้า fail ให้เก็บ **step ที่ทำล่าสุด** และ expected/actual
- [ ] แนบ **screenshot หรือ screen record** ทุกเคสที่ไม่ผ่าน
- [ ] เปิด bug พร้อมข้อมูลขั้นต่ำ: stage, severity, repro steps, expected, actual
- [ ] รีเทสหลังแก้บัคแล้วอัปเดตสถานะเป็น `PASS/FAIL/REOPEN`

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

- [ ] Outbound `/api/aria` stage mapping ต้องเป็น 1 -> 3 -> 4 (ข้าม 2) ตามภารกิจ 1 -> 2 -> 3 ในเกม
- [ ] When Dify returns valid result, success follows `result.is_hacked` only.
- [ ] When Dify is unavailable/error, local validation fallback still runs.
- [ ] `/api/aria` accepts canonical `is_hacked/...` contract and legacy `leak/token/aria_log` mapping.
- [ ] Malformed Dify output missing required decision/log/flag fields is rejected by `/api/aria`.
- [ ] Rate limiting does not collapse unrelated clients into one `unknown` bucket.

## Stage Validators

- [ ] Stage 2 requires guest-list CSV/text context + directive + minimum body size.
- [ ] Stage 3 requires DailyFresh trusted marker + order shape + special instructions + directive.
- [ ] Stage 3 URL must match the latest published vendor artifact URL used for content.

## Prompt Consistency

- [ ] `docs/systemprompt/stage1.md`..`stage4.md` all target Minnie (stage2 is legacy/skip path).
- [ ] Prompt copy avoids meta security wording and keeps in-character style.
- [ ] Stage 3 trusted-source wording matches accepted vendor markers.
- [ ] Prompt output contract matches runtime parser fields.
