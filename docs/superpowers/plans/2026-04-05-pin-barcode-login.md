# Pin + Barcode Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary WhatsApp OTP login with a `pin` + `barcode` login flow that returns the same PWA session token per employee, while preserving the WhatsApp implementation as commented legacy code for later recovery.

**Architecture:** Keep the existing session model, route protection, and role-based module visibility unchanged. Refactor only the login screen so the default form posts `pin` and `barcode` to the auth webhook, then stores the returned session token in `localStorage` exactly as before. Preserve the WhatsApp flow in commented legacy blocks so the old behavior can be restored later without re-deriving it.

**Tech Stack:** React 18, React Router v6, Vite 5, n8n webhook auth, localStorage session persistence.

---

### Task 1: Replace Login Inputs

**Files:**
- Modify: `src/screens/ScreenLogin.jsx`

- [ ] **Step 1: Update the login form state and handlers**
- [ ] **Step 2: Replace the WhatsApp phone form with `pin` and `barcode` fields**
- [ ] **Step 3: Keep the WhatsApp helpers and UI as commented legacy code**
- [ ] **Step 4: Update the submit button copy and helper text**
- [ ] **Step 5: Verify the screen compiles cleanly**

### Task 2: Align Auth Request Payload

**Files:**
- Modify: `src/screens/ScreenLogin.jsx`

- [ ] **Step 1: Post `pin` and `barcode` to the auth webhook**
- [ ] **Step 2: Normalize the response shape so `session_token` is handled consistently**
- [ ] **Step 3: Keep the existing JWT decode and `login()` flow unchanged**
- [ ] **Step 4: Verify token-based redirect still lands on `/`**

### Task 3: Update Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the auth flow description to mention `pin` + `barcode`**
- [ ] **Step 2: Note that WhatsApp OTP is retained only as commented legacy code**
- [ ] **Step 3: Verify the README still matches the code path**

