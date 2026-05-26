# 1pacent MVP — UAT Plan

## Test Environment Setup

### Option A: Local Web Build (Quickest)
```bash
cd /opt/data/1pacent-app
export PATH="/opt/data/flutter/bin:$PATH"
flutter build web
# Serve locally
cd build/web && python3 -m http.server 8080
# Open http://localhost:8080 in browser
```

### Option B: Deploy to VPS (Full Integration)
- Flutter web build served via Nginx container
- Caddy handles SSL at app.1pacent.com
- n8n workflows at api.1pacent.com

### Option C: Android Emulator (Most Realistic)
- Install Android Studio on your Mac
- Create a Pixel 7 API 34 emulator
- Run `flutter run` from the project directory

## Personas for Testing

| Persona | Role | Key Screens |
|---------|------|-------------|
| **Tenant** | Reports issues, approves quotes, pays | Home, Start Job, Job Status, Quotes, Accept Quote, Invoice, Review |
| **Tradie** | Bids on jobs, submits quotes, updates status | Tradie Home, Job Board, Quote Submit, Trust Passport |
| **Landlord** | Approves quotes, monitors portfolio | Approval Screen |
| **Property Manager** | Oversees all jobs, PM dashboard | PM Dashboard, PM Job Detail |
| **Sally** | AI chat assistant for tenants | Sally Chat |

## Seed Data

### Test Work Orders
| ID | Description | Trade | Status |
|----|-------------|-------|--------|
| WO-2026-000042 | Install 2 power points in kitchen | electrical | quote_pending |
| WO-2026-000041 | Fix leaking bathroom tap | plumbing | scheduled |
| WO-2026-000040 | Aircon not cooling | hvac | landlord_approval |
| WO-2026-000039 | Broken light switch | electrical | completed |

### Test Quotes
| ID | Job | Tradie | Amount | Status |
|----|-----|--------|--------|--------|
| Q-001 | WO-2026-000042 | Mike's Electrical | $420 | pending |
| Q-002 | WO-2026-000042 | PowerFix Solutions | $380 | pending |

### Test Users
| Email | Password | Role |
|-------|----------|------|
| tenant@test.com | test123 | tenant |
| tradie@test.com | test123 | tradie |
| landlord@test.com | test123 | landlord |
| pm@test.com | test123 | pm |

## Test Cases

### TC-001: Tenant — Report a New Issue
**Precondition:** Logged in as tenant
**Steps:**
1. Tap "Start Job" on home screen
2. Select trade type: Electrical
3. Describe issue: "Need 2 new power points in kitchen"
4. Set urgency: Normal
5. Submit
**Expected:** Work order created, WO ID shown, status = "requested"
**API:** POST /webhook/rental/work-orders/intake

### TC-002: Tenant — Check Job Status
**Precondition:** WO-2026-000042 exists
**Steps:**
1. Navigate to job from home screen
2. View status timeline
**Expected:** Shows "Finding tradies" as current step
**API:** POST /webhook/customer/job-status

### TC-003: Tenant — Chat with Sally
**Steps:**
1. Navigate to Sally chat
2. Type: "I have a leaking tap"
3. Send message
**Expected:** Sally responds with plumbing-specific guidance
**API:** POST /webhook/agents/sally/chat

### TC-004: Tenant — View and Accept Quote
**Precondition:** Quotes exist for WO-2026-000042
**Steps:**
1. Navigate to job
2. Tap "View Quotes"
3. See 2 quotes listed with tradie details
4. Tap "Accept" on Mike's Electrical ($420)
**Expected:** Quote accepted, status updated
**API:** POST /webhook/accept-quote

### TC-005: Tenant — Pay Invoice
**Precondition:** Quote accepted, invoice generated
**Steps:**
1. Navigate to job
2. Tap "Pay Invoice"
3. See amount: $420
4. Tap "Pay Now"
**Expected:** Payment session created, redirect URL shown
**API:** POST /webhook/initiate-payment

### TC-006: Tenant — Submit Review
**Precondition:** Job completed
**Steps:**
1. Navigate to completed job
2. Tap "Leave Review"
3. Rate 5 stars
4. Write: "Great job, very professional"
5. Submit
**Expected:** Review submitted, confirmation shown
**API:** POST /webhook/submit-review

### TC-007: Tradie — Browse Available Jobs
**Precondition:** Logged in as tradie
**Steps:**
1. Navigate to "Available Jobs"
2. See list of jobs with distance
3. Tap on a job to view details
**Expected:** Shows 3 demo jobs with addresses and distances
**API:** POST /webhook/tradie/jobs

### TC-008: Tradie — Submit Quote
**Precondition:** Viewing job details
**Steps:**
1. Tap "Submit Quote"
2. Add line items: Labour 2hrs @ $55, Materials $160
3. Set total: $270
4. Set availability: "Available tomorrow morning"
5. Submit
**Expected:** Quote submitted, reference number shown
**API:** POST /webhook/submit-quote

### TC-009: Tradie — View Trust Passport
**Steps:**
1. Navigate to own profile/trust passport
**Expected:** Shows licence, insurance, reviews, completed jobs count
**API:** POST /webhook/tradie/trust-passport

### TC-010: Landlord — Approve Quote
**Precondition:** Quote pending approval
**Steps:**
1. Navigate to approval screen
2. See quote details
3. Tap "Approve"
**Expected:** Approval recorded, job proceeds
**API:** POST /webhook/landlord/approval

### TC-011: Property Manager — Dashboard
**Precondition:** Logged in as PM
**Steps:**
1. Navigate to PM Dashboard
2. See list of all jobs in portfolio
3. Tap on a job for details
**Expected:** Shows 2 demo jobs with status and quote counts
**API:** POST /webhook/pm/jobs

### TC-012: Tenant — Update Availability
**Precondition:** Job in scheduling phase
**Steps:**
1. Navigate to job
2. Tap "Update Availability"
3. Add slots: Tomorrow 9am-12pm, Wednesday 2pm-5pm
4. Save
**Expected:** Slots saved, confirmation shown
**API:** POST /webhook/update-availability

### TC-013: Tenant — View Notifications
**Steps:**
1. Navigate to Notifications
**Expected:** Shows 3 demo notifications (2 unread)
**API:** POST /webhook/notifications

### TC-014: Tenant — Mark Notifications Read
**Steps:**
1. In notifications, tap "Mark All Read"
**Expected:** All notifications marked as read
**API:** POST /webhook/notifications/read

### TC-015: Auth — Register New Account
**Steps:**
1. Navigate to Register
2. Enter email: newuser@test.com
3. Enter name: Test User
4. Enter password: test123
5. Submit
**Expected:** Account created, logged in, redirected to home
**API:** POST /webhook/auth/register

### TC-016: Auth — Login
**Steps:**
1. Navigate to Login
2. Enter email: tenant@test.com
3. Enter password: test123
4. Submit
**Expected:** Logged in, redirected to home
**API:** POST /webhook/auth/login

### TC-017: Warranty Check
**Precondition:** Job flagged for warranty review
**Steps:**
1. Navigate to job with warranty flag
2. See warranty banner
**Expected:** Shows warranty review result from Sparky
**API:** POST /webhook/rental/warranty/review-with-sparky

## Success Criteria

### Must Have (P0)
- [ ] All 17 test cases pass
- [ ] No flutter analyze errors
- [ ] All n8n webhooks return valid JSON
- [ ] Auth flow works (register, login, refresh)
- [ ] Job lifecycle works end-to-end (create → quote → accept → pay → review)

### Should Have (P1)
- [ ] Notifications work (fetch, mark read)
- [ ] File upload works
- [ ] PM dashboard shows jobs
- [ ] Landlord approval flow works

### Nice to Have (P2)
- [ ] Geocoding integration
- [ ] Push notifications
- [ ] Real payment gateway integration

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Flutter App (21 screens) | ✅ Complete | Sprints 1-5 done, 0 analyze errors |
| n8n Workflows (21 webhooks) | ✅ Created | All activated on VPS |
| .env Configuration | ✅ Created | Points to VPS n8n |
| Seed Data | ✅ In workflows | Demo data in each webhook response |
| UAT Plan | ✅ This document | 17 test cases defined |
| Android Emulator | ❌ Not set up | Need Android Studio |
| VPS Deployment | ❌ Not deployed | Need Nginx container + Caddy config |
| GitHub Issues | ❌ Not tracked | Need to create issues for UAT |
