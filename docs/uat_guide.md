# 1pacent MVP — UAT Testing Guide

## 🚀 Quick Start

### Access the App

| Method | URL | Notes |
|--------|-----|-------|
| **Domain (once DNS propagates)** | `https://app.1pacent.com` | Full SSL, production |
| **Direct IP (right now)** | `http://75.119.151.166` | No SSL, but works immediately |
| **n8n API** | `https://api.1pacent.com` | Backend webhooks |
| **n8n Editor** | `https://n8n.1pacent.com` | Workflow management |

### Test Accounts

| Email | Password | Role |
|-------|----------|------|
| `tenant@test.com` | `test123` | Tenant |
| `tradie@test.com` | `test123` | Tradie |
| `landlord@test.com` | `test123` | Landlord |
| `pm@test.com` | `test123` | Property Manager |

### Seed Data (Pre-loaded)

**Work Orders:**
| ID | Description | Trade | Status |
|----|-------------|-------|--------|
| WO-DEMO-001 | Install 2 power points in kitchen | electrical | triaged |
| WO-DEMO-002 | Replace faulty power point | electrical | triaged |
| WO-2026-000042 | Install power points | electrical | quote_pending |
| WO-2026-000043 | Fix leaking tap | plumbing | quote_pending |
| WO-2026-000044 | Aircon not cooling | hvac | quote_pending |

---

## 📱 Persona Testing

### 🏠 Persona 1: Tenant (Mark)

**Starting point:** Home screen → "Start Job" or view existing jobs

#### Test 1: Report a New Issue
1. Open the app → tap **"Start Job"**
2. Select trade: **Electrical**
3. Describe: *"Need 2 new power points in kitchen"*
4. Set urgency: **Normal**
5. Set preferred time: **Monday morning**
6. Tap **Submit**
7. ✅ **Expected:** Work order created, WO ID shown, status = "requested"

#### Test 2: Check Job Status
1. From home, tap on **WO-DEMO-001**
2. View status timeline
3. ✅ **Expected:** Shows timeline with "Requested" → "Finding tradies" (completed), "Quote approved" (pending)

#### Test 3: Chat with Sally
1. Navigate to **Sally Chat** (bottom nav or home)
2. Type: *"I have a leaking tap"*
3. Tap **Send**
4. ✅ **Expected:** Sally responds with plumbing-specific guidance

#### Test 4: View and Accept Quote
1. Navigate to a job with quotes
2. Tap **"View Quotes"**
3. See quote cards with tradie name, amount, trust score
4. Tap **"Accept"** on a quote
5. ✅ **Expected:** Quote accepted, status updates

#### Test 5: Pay Invoice
1. Navigate to job → **"Pay Invoice"**
2. See amount due
3. Tap **"Pay Now"**
4. ✅ **Expected:** Payment session created

#### Test 6: Submit Review
1. Navigate to completed job
2. Tap **"Leave Review"**
3. Rate: ⭐⭐⭐⭐⭐
4. Write: *"Great job, very professional"*
5. Tap **Submit**
6. ✅ **Expected:** Review submitted, confirmation shown

#### Test 7: Update Availability
1. Navigate to job → **"Update Availability"**
2. Add slot: Tomorrow 9am-12pm
3. Tap **Save**
4. ✅ **Expected:** Slots saved, confirmation shown

#### Test 8: View Notifications
1. Navigate to **Notifications** (bell icon)
2. See notification list
3. ✅ **Expected:** Shows notifications with unread indicators

---

### 🔧 Persona 2: Tradie (Mike)

**Starting point:** Tradie Home → "Available Jobs"

#### Test 9: Browse Available Jobs
1. Open app → **Tradie Home**
2. Tap **"Available Jobs"**
3. See list with distances
4. ✅ **Expected:** Shows 3 demo jobs (electrical, plumbing, hvac)

#### Test 10: View Job Details
1. Tap on **"Install power points"** (WO-2026-000042)
2. See full description, address, urgency
3. ✅ **Expected:** Job details with map preview

#### Test 11: Submit Quote
1. From job details → **"Submit Quote"**
2. Add line items:
   - Labour 2hrs @ $55/hr = $110
   - Materials = $160
3. Total: **$270**
4. Availability: *"Available tomorrow morning"*
5. Tap **Submit**
6. ✅ **Expected:** Quote submitted, reference number shown

#### Test 12: View Trust Passport
1. Navigate to **Profile** → **Trust Passport**
2. ✅ **Expected:** Shows licence, insurance, reviews, completed jobs, trust score

---

### 🏢 Persona 3: Landlord (Laura)

#### Test 13: Approve Quote
1. Navigate to **Approval** screen
2. See pending quote for WO-DEMO-001
3. Review amount: $250 (within $300 limit)
4. Tap **"Approve"**
5. ✅ **Expected:** Approval recorded, job proceeds

---

### 📊 Persona 4: Property Manager (Pat)

#### Test 14: PM Dashboard
1. Navigate to **PM Dashboard**
2. See portfolio overview
3. Tap on a job for details
4. ✅ **Expected:** Shows all jobs with status, tradie, and quote info

---

## ✅ UAT Checklist

Copy this into a spreadsheet or GitHub issue comments:

```
Test | Persona | Steps | Expected | Actual | Pass/Fail | Notes
-----|---------|-------|----------|--------|------|------
TC-001 | Tenant | Report new issue | WO created | | |
TC-002 | Tenant | Check job status | Timeline shown | | |
TC-003 | Tenant | Chat with Sally | AI response | | |
TC-004 | Tenant | Accept quote | Status updated | | |
TC-005 | Tenant | Pay invoice | Payment session | | |
TC-006 | Tenant | Submit review | Confirmation | | |
TC-007 | Tenant | Update availability | Slots saved | | |
TC-008 | Tenant | View notifications | List shown | | |
TC-009 | Tradie | Browse jobs | 3 jobs shown | | |
TC-010 | Tradie | Submit quote | Ref number | | |
TC-011 | Tradie | Trust passport | Score shown | | |
TC-012 | Landlord | Approve quote | Approved | | |
TC-013 | PM | Dashboard | Jobs listed | | |
TC-014 | Any | Register account | Account created | | |
TC-015 | Any | Login | Logged in | | |
```

## 🐛 Reporting Bugs

When you find a bug, note:
1. **Which persona** you were testing as
2. **Which screen** you were on
3. **What you expected** to happen
4. **What actually** happened
5. **Screenshot** if possible

File bugs at: https://github.com/1pacent/1pacent-app/issues

## 📊 Current System Status

| Component | Status | URL |
|-----------|--------|-----|
| Flutter App | ✅ Deployed | `https://app.1pacent.com` |
| n8n API | ✅ 21/21 webhooks working | `https://api.1pacent.com` |
| n8n Editor | ✅ Running | `https://n8n.1pacent.com` |
| Postgres | ✅ 12 WOs, 8 quotes, 11 tradies | Internal |
| Caddy SSL | ✅ Configured | All domains |
| DNS | ⏳ Propagating | Should resolve in 1-4 hours |
