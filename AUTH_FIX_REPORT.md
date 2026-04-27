# Auth Fix Report

## What was broken

1. **Users could appear "forgotten" after refresh**
   - Session handling on the dashboard would clear auth on generic `/api/auth/me` failures, not just true auth failures.
   - This caused false logouts during transient API/network errors.

2. **Login error quality was poor**
   - Login responses used a generic invalid-credentials message for multiple causes.
   - Users could not tell if they used a wrong password vs unknown email.

3. **Signup duplicate handling was confusing**
   - Duplicate signup had an auto-login fallback path that could create confusing states.
   - Needed strict duplicate-account blocking with clear guidance.

4. **Login / signup entry points were hard to find**
   - On the dashboard, auth controls were buried in a collapsible account section.
   - No obvious top-right Login / Sign Up controls.

5. **Protected pages did not consistently redirect**
   - Several AI/protected pages showed sign-in messages but did not always route logged-out users to the auth page.

6. **Potential persistence inconsistency for user store file path**
   - `USER_STORE_FILE` could be relative in a way that depended on working directory.


## What was fixed

### Backend auth and persistence

#### 1) User store path hardening
- **File:** `services/userStore.js`
- Resolved `USER_STORE_FILE` to an absolute path:
  - If env path is absolute, use it directly.
  - If relative, resolve against `process.cwd()`.
- This reduces accidental writes/reads to unexpected locations and improves user persistence reliability.

#### 2) Login semantics improved
- **File:** `routes/auth.js`
- Login input now trims password before verification.
- Added explicit error semantics:
  - Unknown email -> `404`, `error: "unknown_email"`, message: `"No account found for this email. Sign up first."`
  - Wrong password -> `401`, `error: "incorrect_password"`, message: `"Incorrect password. Please try again."`
- Existing lockout/rate-limit protections remain active.

#### 3) Duplicate signup is now clearly blocked
- **File:** `routes/auth.js`
- Removed automatic "existingAccount login" behavior from signup conflict flow.
- Duplicate signup now returns explicit `409 email_in_use` (or social-signin-required variant), with clear message.


### Frontend auth UX and state handling

#### 4) Obvious top-right auth controls
- **File:** `frontend/src/index.html`
- Added prominent header auth controls in top-right:
  - `Log in`
  - `Sign up`
  - `Profile` (shown when logged in)
  - `Log out` (shown when logged in)

#### 5) Header auth control behavior wired
- **File:** `frontend/src/app.js`
- Added header auth button/link wiring:
  - Login/Signup links route to `/ai-trade-access.html` with `mode` + `next`.
  - Profile opens account details section.
  - Header logout triggers the main logout flow.
- `renderAuthState()` now toggles visibility:
  - Logged out: show Login + Sign Up
  - Logged in: show Profile + Log out

#### 6) Session restoration resilience improved
- **File:** `frontend/src/app.js`
- `fetchCurrentUser()` now:
  - Only clears auth token on confirmed `401` auth failures.
  - Does **not** force logout on non-401 transient errors.
  - Attempts remember-token restore after real 401s.
- This directly addresses users being unexpectedly "forgotten."

#### 7) Early auth loading state
- **Files:** `frontend/src/app.js`, `frontend/src/styles.css`
- Added initial auth state UX:
  - Displays "Checking your session..." on app load.
  - Uses `.auth-checking` style while session hydration runs.

#### 8) Cleaner access page messaging and mode support
- **Files:** `frontend/src/ai-trade-access.html`, `frontend/src/ai-trade-access.js`
- Updated page copy to clearly indicate both login and signup are available.
- Added mode-based experience:
  - `?mode=login` highlights login flow
  - `?mode=signup` highlights signup flow

#### 9) Protected-page redirect hardening
- **Files:**
  - `frontend/src/ai-trade.js`
  - `frontend/src/ai-analyzer.js`
  - `frontend/src/ai-bot-trader.js`
  - `frontend/src/ai-bot-account.js`
  - `frontend/src/ai-bot-paper-connect.js`
  - `frontend/src/ai-bot-funding.js`
  - `frontend/src/ai-bot-funding-payment.js`
  - `frontend/src/ai-live-account-setup.js`
  - `frontend/src/ai-broker-direct-setup.js`
- Logged-out users are now consistently redirected to sign-in with preserved `next` path.
- This prevents null-user crashes and broken flows on protected pages.


## How auth works now

1. **Signup**
   - Email is normalized (`trim + lowercase`).
   - Password policy enforced.
   - Duplicate accounts blocked with clear `409` responses.
   - Passwords are stored hashed (bcrypt).

2. **Login**
   - Email/password normalized at input.
   - Password verified against bcrypt hash.
   - Wrong password and unknown email return distinct, accurate errors.
   - Lockout protections remain.

3. **Session restore**
   - Short-lived auth token stored in localStorage.
   - Long-lived remember token stored in localStorage.
   - On load, app attempts `/api/auth/session/restore` when needed.
   - Remember token rotation and expiry enforced server-side.

4. **UI auth state**
   - Logged out -> header shows Login + Sign Up.
   - Logged in -> header shows Profile + Log out.
   - Dashboard and protected pages update based on actual session state.


## How sessions are stored

- **Client storage**
  - `localStorage["dumbdollars_token"]`: bearer JWT for API requests.
  - `localStorage["dumbdollars_remember_token"]`: rotating remember token for session restoration.
  - `localStorage["dumbdollars_saved_email"]`: convenience email prefill.

- **Server storage**
  - Users and remember session metadata in `USER_STORE_FILE` JSON.
  - Remember sessions store **token hash** (SHA-256), expiry, and last-used timestamps.
  - Remember token is rotated on restore.


## Exact test steps and results

### Environment
- Started server with `node server.js`.
- API tests executed against `http://127.0.0.1:5000`.

### API scenario test matrix (executed)
1. Create new account -> **PASS** (`201`)
2. Duplicate signup blocked -> **PASS** (`409 email_in_use`)
3. Wrong password error -> **PASS** (`401 incorrect_password`)
4. Unknown email error -> **PASS** (`404 unknown_email`)
5. Log back in existing user -> **PASS** (`200`)
6. Refresh/session with token (`/api/auth/me`) -> **PASS** (`200`)
7. Restore from remember token -> **PASS** (`200`)
8. `/api/auth/me` after restore -> **PASS** (`200`)
9. Logout via remember revoke -> **PASS** (`200`)
10. Restore after logout blocked -> **PASS** (`401 invalid_remember_token`)
11. Protected route without auth -> **PASS** (`401 unauthorized`)

### Page availability smoke check
- Verified HTTP `200` for:
  - `/`
  - `/ai-trade-access.html`
  - `/ai-trade.html`
  - `/ai-analyzer.html`
  - `/ai-bot-trader.html`
  - `/ai-bot-account.html`
  - `/ai-bot-funding.html`
  - `/ai-bot-funding-payment.html`
  - `/ai-live-account-setup.html`
  - `/ai-broker-direct-setup.html`

### Build/syntax checks
- JS syntax checks passed for touched auth files.
- Frontend build succeeded via `node frontend/scripts/build.js`.


## Remaining issues / notes

1. **Account enumeration tradeoff**
   - Returning distinct unknown-email vs wrong-password errors improves UX, but increases account-discovery risk.
   - If stricter security posture is desired, switch back to generic invalid-credentials messaging.

2. **No browser-automation suite in repo**
   - Mobile interaction testing is implemented at responsive/UI logic level and API correctness level.
   - Add Playwright/Cypress later for automated device-level auth regression coverage.

