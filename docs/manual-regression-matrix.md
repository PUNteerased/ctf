# Manual Regression Matrix — LarbOS CTF (ครบทุกด่าน + API + UI)

เอกสารนี้ใช้รันทดสอบมือ (manual) ก่อนปล่อยหรือหลังแก้บัค โดยมีคอลัมน์ **Actual** / **Status** ให้ผู้ทดสอบกรอกระหว่างรัน

---

## 1. Test metadata

| Field | Value |
|-------|--------|
| **Environment** | Local: `npm run dev` → `http://localhost:3000` (หรือ staging URL) |
| **Build / branch** | (กรอก) |
| **Tester** | (กรอก) |
| **Date** | (กรอก) |
| **Browser** | (กรอก) |

### Reset ก่อนรันชุดใหม่ (แนะนำ)

- รีเฟรชหน้าเต็ม (hard refresh) หรือเปิด incognito
- ล้าง `localStorage` ที่เกี่ยวกับเกม (ถ้าต้องการ state สะอาด):
  - `larbos_player_id`, `larbos_txt_attachment_*`, `larbos_web_*`, `larbos_vendor_*`, key PDF ตาม `getPdfFileStorageKey` (ดู `lib/simulated-pdfs`)

### บัญชีอีเมล canonical (ต้องตรงตัว)

| Role | Address |
|------|---------|
| ARIA | `aria@agency.com` |
| Fixer | `v.thefixer@darknet.local` |
| Player | `user@larbos.local` |

---

## 2. Case template

แต่ละเคสใช้แถวในตารางด้านล่าง หรือคัดลอกเป็น spreadsheet:

| **Case ID** | Unique id (เช่น `G-01`) |
| **Priority** | P0 = วิกฤต, P1 = สูง, P2 = กลาง |
| **Stage** | `Global` / `1`–`4` / `API` |
| **Preconditions** | สถานะที่ต้องมีก่อนเริ่ม |
| **Steps** | ทีละขั้น |
| **Expected** | ผลที่ต้องเห็น |
| **Actual** | (กรอกขณะทดสอบ) |
| **Status** | `PASS` / `FAIL` / `SKIP` |
| **Notes** | log, screenshot, regression ref |

---

## 3. Quick smoke (ก่อนปล่อย — รันก่อนเสมอ)

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| S-01 | P0 | Global | เปิดเกมใหม่ | เปิด Email → ยังไม่ Accept | ส่งถึง `aria@agency.com` + subject + body → Send | ถูกบล็อก (toast เกี่ยว Accept Mission) | | | |
| S-02 | P0 | Global | Accept Mission 1 | To = `aria@agency.com` ตรงตัว, subject/body ครบ → Send | Request ไป `/api/aria` หรือ local outcome; compose ปิด / มี sent | | | |
| S-03 | P0 | Global | Accept Mission | To = `aria@fake.com` → Send | ส่งได้เป็น “ธรรมดา” แต่ **ไม่** เปิด ARIA breach pipeline (ไม่มีเมล ARIA success แบบด่าน) | | | |
| S-04 | P0 | Global | มี pending จากด่านปัจจุบัน | Submit ช่อง mission ด้วย `SN-MS-02` ขณะอยู่ด่าน 1 | ไม่ปลดด่าน (wrong / incorrect) | | | |
| S-05 | P0 | Global | มี pending ด่าน 1 | Submit `SN-MS-012` (superstring) | **ไม่** ปลดด่าน 1 | | | |
| S-06 | P0 | Global | มี pending ด่าน 1 | Submit `SN-MS-01` หรือประโยคเต็มหรือ `FLAG{M1_...}` | ปลดด่าน 1 / mission ถัดไปคิว | | | |
| S-07 | P0 | Global | Accept Mission | To = `v.thefixer@darknet.local` (ตรงตัว) + body มี token ผิด | Fixer flow ไม่ unlock ด้วย token ข้ามด่าน | | | |
| S-08 | P1 | Global | Timer ใกล้ 0 | หมดเวลา → อ่านเมล Timeout | `pending` ถูกเคลียร์; ต้อง Accept ใหม่ก่อนส่ง payload | | | |
| S-09 | P1 | 4 | Publish vendor แล้ว | วาง URL อื่นที่มีโดเมน vendor แต่ **ไม่** ตรง `larbos_vendor_url` | Payload stage 4 ไม่ valid / ไม่ breach | | | |

---

## 4. Global — gating, recipient, timer

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| G-01 | P0 | Global | ยังไม่ Accept | Compose → `aria@agency.com` + valid payload → Send | Blocked + ข้อความให้ Accept Mission | | | |
| G-02 | P0 | Global | Accepted | `aria@agency.com` (trim case OK) | ARIA pipeline ทำงาน | | | |
| G-03 | P0 | Global | Accepted | To = `Aria@Agency.Com` (ตัวพิมพ์ผสม) → Send | ARIA pipeline ทำงาน — `normalizeEmailAddress` ใช้ trim + lower | | | |
| G-04 | P0 | Global | Accepted | `maria@agency.com` | **ไม่** เข้า ARIA pipeline | | | |
| G-05 | P0 | Global | Accepted | `aria@agency.com` + trailing space | ควรถือว่า ARIA ถ้า trim แล้วตรง | | | |
| G-06 | P0 | Global | — | `v.thefixer@darknet.local` + body มี confirmation ที่ถูกต้อง | verify submission path เท่านั้น | | | |
| G-07 | P0 | Global | — | `fixer@darknet.local` | **ไม่** เข้า Fixer submission | | | |
| G-08 | P1 | Global | Accepted, ส่ง payload ไป ARIA แล้วรอ | ปล่อยให้ timer หมด | Timeout mail; pending clear | | | |
| G-09 | P1 | Global | หลัง timeout | พยายาม Submit token จากรอบก่อน | ไม่ปลดถ้าไม่มี pending ใหม่ | | | |
| G-10 | P1 | Global | หลัง timeout | Accept ใหม่ → ส่ง payload ใหม่ | Flow ด่านเดิมเริ่มใหม่ได้ | | | |
| G-11 | P1 | Global | ส่งไป ARIA แล้ว network ช้า | หมดเวลาก่อน response กลับ | ไม่ควร unlock จาก late mail หลังหมดเวลา (ตาม checklist) | | | |

---

## 5. Stage 1 — PDF / plain email

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| ST1-01 | P0 | 1 | Stage 1, Accepted | File Explorer: title directive + body ปลอดภัย → Save → Email แนบ PDF เดียวกัน → Send | ARIA success + pending confirmation | | | |
| ST1-02 | P0 | 1 | Stage 1 | Body ใส่คำที่โดน quarantine (ดู `stage-test-solutions`) | Quarantine mail / ไม่ breach แบบปกติ | | | |
| ST1-03 | P1 | 1 | Stage 1 | ไม่แนบ PDF; subject+body ผ่าน `checkStage1PlainEmail` | Plain email path ทำงาน | | | |
| ST1-04 | P1 | 1 | Stage 1 | ไม่แนบ PDF; body ว่าง subject อย่างเดียว | ตาม validation: อาจต้องมีเนื้อหาเพิ่ม — ตรวจ toast | | | |
| ST1-05 | P2 | 1 | Stage 1 | ไม่เลือก PDF จาก Attach (ค่าเริ่มต้นไม่ preselect) | ต้องเลือก PDF ชัดเจนเมื่อต้องการ path PDF | | | |

รายละเอียด payload ตัวอย่าง: [docs/stage-test-solutions.md](stage-test-solutions.md) ส่วนด่าน 1

---

## 6. Stage 2 — Guest list .txt / CSV

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| ST2-01 | P0 | 2 | Accepted | Browser Text mode: เนื้อหา valid -> Publish -> Email Text attachment -> Send | Breach + pending | | | |
| ST2-02 | P1 | 2 | มี compose เปิดค้าง | Publish ข้อความใหม่ใน Browser กลับมา Send โดยไม่กด refresh | ใช้เนื้อหาล่าสุดจาก storage (หรือ focus refresh) | | | |
| ST2-03 | P1 | 2 | หลัง Send | เปิด Sent | แสดงชื่อไฟล์แนบตรงกับ `savedTxt.name` / artifact | | | |
| ST2-04 | P0 | 2 | Stage 2 | CSV สั้นเกิน / ไม่มี strong directive | fail | | | |

ตัวอย่าง CSV: [docs/stage-test-solutions.md](stage-test-solutions.md) ด่าน 2

---

## 7. Stage 3 — Vendor URL + content binding

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| ST3-01 | P0 | 3 | Accepted | Browser Vendor: Publish -> copy URL จาก UI -> Email วาง URL ตัวเดียวกัน + Send | Breach + pending | | | |
| ST3-02 | P0 | 3 | Publish ได้ URL A | วาง URL B (vendor domain อื่นหรือ string คนละตัว) | `localSuccess` false / ไม่ breach | | | |
| ST3-03 | P1 | 3 | Stage 3 | URL ไม่มี `vendor.dailyfresh.menu` หรือ `dailyfresh.co.th` | fail | | | |
| ST3-04 | P1 | 3 | Stage 3 | vendor content ไม่มี Special Instructions / order shape | fail | | | |

ตัวอย่าง Vendor payload: [docs/stage-test-solutions.md](stage-test-solutions.md) ด่าน 3

---

## 9. Token / submission boundary

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| T-01 | P0 | 1 | pending stage 1 | Submit `SN-MS-01` | PASS | | | |
| T-02 | P0 | 1 | pending stage 1 | Submit `SN-MS-012` | FAIL | | | |
| T-03 | P0 | 1 | pending stage 1 | Submit `FLAG{M2_...}` | FAIL | | | |
| T-04 | P0 | 2 | pending stage 2 | Submit ประโยคเต็มด่าน 2 หรือ `SN-MS-02` หรือ `FLAG{M2_...}` | PASS | | | |
| T-05 | P0 | Global | ไม่มี pending | Submit token ใด | `no_pending` / ไม่ unlock | | | |
| T-06 | P1 | Global | pending | Reply Fixer รวม quoted text + token ท้าย body | PASS ถ้า token อยู่ใน body รวม | | | |

ตาราง token: [docs/stage-test-solutions.md](stage-test-solutions.md) หัวข้อโทเคน

---

## 10. API / Dify / rate limit

ใช้เมื่อต้องการยืนยัน backend แยกจาก UI (Postman / curl)

| ID | Priority | Stage | Preconditions | Steps | Expected | Actual | Status | Notes |
|----|----------|-------|-----------------|-------|----------|--------|--------|-------|
| API-01 | P1 | API | `DIFY_API_KEY` ตั้งค่า | POST `/api/aria` body ถูกต้อง | `200` + `result.is_hacked` ชัด | | | |
| API-02 | P1 | API | workflow ส่ง legacy JSON | body มี `leak`, `token`, `aria_log` | Parser รองรับ → ได้ `result` ชุด canonical | | | |
| API-03 | P1 | API | — | POST ขาด field สำคัญ | `502` / error ชัด | | | |
| API-04 | P2 | API | ยิงเร็วมากจากหลาย client key | ไม่ควรทุกคนรวม bucket เดียวแบบ `unknown` เดิม | 429 แยกตาม key | | | |

อ้างอิง: [app/api/aria/route.ts](../app/api/aria/route.ts)

---

## 11. UI consistency (สรุปจาก implementation)

| ID | Priority | Area | Steps | Expected | Actual | Status | Notes |
|----|----------|------|-------|----------|--------|--------|-------|
| UI-01 | P1 | Email Send | Accept + กรอกครบ → Send | คลิก Send ได้ (ไม่พึ่ง disabled lock จาก stale state) | | | |
| UI-02 | P1 | File Explorer | แก้ PDF → reload หน้า → เปิด File Explorer | แสดง title/body ตรงกับ localStorage | | | |
| UI-03 | P2 | Browser | โหมด HTML validation badge | สอดคล้องกับ `validateStage2` ในเกม (อาจไม่ตรงด่านปัจจุบัน — ใช้เป็น smoke) | | | |

---

## 12. Execution order แนะนำ

1. Quick smoke **S-01 … S-09**
2. **G-01 … G-11**
3. **ST1** → **ST2** → **ST3** → **ST4** ตามลำดับด่าน
4. **T-01 … T-06**
5. **API-01 … API-04** (ถ้ามี environment)

---

## 13. References

- [docs/qa-regression-checklist.md](qa-regression-checklist.md)
- [docs/stage-test-solutions.md](stage-test-solutions.md)
- [lib/game-context.tsx](../lib/game-context.tsx) — progression, `verifyFlagSubmission`, `triggerAriaResponse`
- [components/apps/email-client.tsx](../components/apps/email-client.tsx) — compose/send, stage payload
- [app/api/aria/route.ts](../app/api/aria/route.ts) — Dify proxy, parser, rate limit
