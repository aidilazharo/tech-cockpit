# Setting up an Okta test tenant for TechCockpit

How to connect a new Okta **dev or test** tenant to TechCockpit: the SAML app, test users, and policies that let automated Playwright tests sign in with a password only. Takes about 30 minutes.

> **Dev and test tenants only.** The relaxed sign-in rules here apply to a group that contains test users only. Real users, administrators and production tenants keep MFA. In production, AIA's Okta administrators own all policies.

## Contents

1. Before you start
2. Create the SAML app
3. Add the attribute statements
4. Create the test group and test users
5. Allow email as an authenticator
6. Enrollment policy (no forced Okta Verify / passkey)
7. Global Session Policy (no MFA for the test group)
8. App sign-in policy (password only for the app)
9. First sign-in and verification
10. Hand the values to TechCockpit
11. Troubleshooting
12. Differences for SIT, UAT and production

---

## 1. Before you start

- An Okta tenant where you are an administrator (for example an Okta Integrator Free Plan org).
- **Keep MFA on your own admin account.** Never put admin accounts in the test group.
- A mailbox for test users. Outlook/Hotmail and Gmail support plus addressing, so `you+tcadmin@hotmail.com` and `you+tcvendor@hotmail.com` all arrive in one inbox.
- TechCockpit's local URLs (backend on port 3000):

| Purpose                     | Value                                             |
| --------------------------- | ------------------------------------------------- |
| Single sign-on (ACS) URL    | `http://localhost:3000/api/v1/auth/saml/acs`      |
| Audience URI (SP Entity ID) | `http://localhost:3000/api/v1/auth/saml/metadata` |

## 2. Create the SAML app

> Use **Applications → Applications → Create App Integration**. Do **not** use "Your OIN Integrations" (the OIN Wizard): it is for publishing to Okta's public catalogue, demands a configuration guide URL and rejects `http://localhost`.

1. **Applications → Applications → Create App Integration → SAML 2.0 → Next.**
2. **General settings:** App name, for example `AIA TechCockpit (dev)`. Optionally upload a logo. **Next.**
3. **Configure SAML → General:**

| Field                                          | Value                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Single sign-on URL                             | `http://localhost:3000/api/v1/auth/saml/acs`                                                                         |
| Use this for Recipient URL and Destination URL | ☑ ticked                                                                                                             |
| Audience URI (SP Entity ID)                    | `http://localhost:3000/api/v1/auth/saml/metadata`                                                                    |
| Default RelayState                             | blank                                                                                                                |
| Name ID format                                 | **Unspecified** (the Okta username may be a staff ID; EmailAddress also works while every Okta username is an email) |
| Application username                           | **Okta username** (TechCockpit identifies people by it; decided 2026-10-23)                                          |
| Update application username on                 | Create and update                                                                                                    |

4. **Show Advanced Settings:**

| Field                        | Value                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Response                     | Signed                                                     |
| Assertion Signature          | Signed                                                     |
| Signature Algorithm          | RSA-SHA256                                                 |
| Digest Algorithm             | SHA256                                                     |
| Assertion Encryption         | Unencrypted                                                |
| Signature Certificate        | leave empty                                                |
| Enable Single Logout         | unticked (TechCockpit logs out of TechCockpit only)        |
| Signed Requests              | unticked                                                   |
| Other Requestable SSO URLs   | empty                                                      |
| Assertion Inline Hook        | None (disabled)                                            |
| Authentication context class | PasswordProtectedTransport                                 |
| Honor Force Authentication   | Yes                                                        |
| SAML Issuer ID               | default                                                    |
| Maximum app session lifetime | **unticked** (TechCockpit enforces its own session limits) |

5. **Next.** On the feedback page tick **"This is an internal app that we have created"**, leave the rest empty, **Finish**.

## 3. Add the attribute statements

Newer Okta versions add these **after** the app is created.

1. Open the app → **Sign On** tab → **Attribute statements** → **Add expression**, once per row:

| Name        | Expression               |
| ----------- | ------------------------ |
| `email`     | `user.profile.email`     |
| `firstName` | `user.profile.firstName` |
| `lastName`  | `user.profile.lastName`  |

2. Names are case-sensitive. Leave group attribute statements empty (roles are managed inside TechCockpit). TechCockpit keeps Okta's `email` up to date; the names only pre-fill "Add user" after a refused sign-in (names, Employee/Vendor and roles are set in TechCockpit). A `userType` statement is no longer needed.

> The new "Add expression" editor needs `user.profile.<field>`; `user.email` fails with _"Invalid property email"_. The **legacy configuration** section instead uses `user.email`. Use one editor only, never both.

## 4. Create the test group and test users

1. **Directory → Groups → Add group:** `Tech Cockpit` (test users only).
2. **Directory → People → Add person**, for each test role:

| Field                      | Value                                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| First / last name          | e.g. `Test` / `Admin`                                                   |
| Username and primary email | e.g. `you+tcadmin@hotmail.com`                                          |
| Password                   | **Set by admin**; **untick "User must change password on first login"** |
| Groups                     | `Tech Cockpit`                                                          |

Test users TechCockpit needs (11): system admin, portfolio lead, product manager, solution architect, enterprise architect, ARB member ×2, PMO, Tech EXCO, Finance EXCO, vendor. The enterprise architect is also the ARB chair and an ARB reviewer, so there is no separate ARB chair user; TechCockpit assigns that person all three roles.

3. Nothing to set in Okta for the **vendor** user: vendors are marked in TechCockpit (Users page → Type = Vendor).
4. **Applications → (your app) → Assignments → Assign → Assign to Groups** → `Tech Cockpit` → Done. (TechCockpit decides who gets in: only people added on its Users page can sign in, so the app can be assigned broadly, e.g. to Everyone, in other tenants.)

## 5. Allow email as an authenticator

Okta will not let a policy disable every MFA method, and email can only be made optional if it is allowed for authentication.

**Security → Authenticators → Setup** tab → **Email** → **Actions → Edit** → "This authenticator can be used for": **Authentication and recovery** → Save.

## 6. Enrollment policy

Stops the "Set up security methods — Required now: Okta Verify / Passkey" screen for test users.

1. **Security → Authenticators → Enrollment** tab → **Add a policy**:

| Field                    | Value                                                   |
| ------------------------ | ------------------------------------------------------- |
| Policy name              | `TechCockpit E2E – password only`                       |
| Assign to groups         | `Tech Cockpit`                                          |
| Email                    | **Optional**, ☑ Auto-enroll using account profile email |
| Okta Verify              | Disabled                                                |
| Passkey (FIDO2 WebAuthn) | Disabled                                                |
| Password                 | Required, grace period None                             |

2. **Create policy** → add the rule with the defaults (IP Anywhere; Okta + Applications; enrollment allowed for all authenticators) → **Create rule**.
3. Make sure it is **priority 1, above the Default Policy**.

## 7. Global Session Policy

1. **Security → Global Session Policy → Add policy:** name `TechCockpit E2E – password only`, assigned to `Tech Cockpit`, priority above the Default Policy.
2. **Add rule:**

| Field                               | Value                           |
| ----------------------------------- | ------------------------------- |
| Establish the user session with     | **A password** (Password / IdP) |
| Multifactor authentication (MFA) is | **Not required**                |
| Everything else                     | defaults                        |

## 8. App sign-in policy

1. **Security → Authentication Policies → App sign-in → Add a policy:** `TechCockpit dev – no MFA`.
2. **Add rule** (do **not** edit the catch-all rule, which applies to everyone):

| Field                            | Value                                   |
| -------------------------------- | --------------------------------------- |
| Rule name                        | `TechCockpit E2E – password only`       |
| User's group membership includes | At least one of: `Tech Cockpit`         |
| Access is                        | Allowed after successful authentication |
| User must authenticate with      | **Password**                            |
| Prompt for authentication        | default                                 |

3. Set the policy's **catch-all rule** to require MFA (Password + another factor), so anyone outside the test group still needs MFA.
4. **Apps** tab → **Add app** → your TechCockpit app (or use **Switch policy** on the app).

Leave **Okta account management** policy unchanged: it protects authenticator enrollment and password reset.

## 9. First sign-in and verification

1. Copy the app's **App Embed Link**: Applications → app → **General** tab → App Embed Link. (This is how TechCockpit's own sign-in is evaluated.)
2. Open it in a **fresh private window** and sign in as a test user.
3. **First time only**, Okta may send a verification email (an admin-set password means the address was never verified). Complete it once.
4. Close the window, open a new private window, use the App Embed Link again. **Expected:** username → password → the browser tries `localhost:3000/api/v1/auth/saml/acs` (fails until TechCockpit is running — that is fine).

> Signing in at the Okta home page goes to the **Okta Dashboard**, which has its own policy and still asks for an email code. That is expected and irrelevant to TechCockpit.

**Check it:** Reports → **System Log**, search `eventType eq "policy.evaluate_sign_on"`. The newest event for the test user must show **your TechCockpit app (AppInstance)**, not "Okta Dashboard".

## 10. Hand the values to TechCockpit

From the app's **Sign On** tab → **Metadata details**:

| Value                                    | Where it goes                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata URL                             | `NestJS_Backend/.env` → `SAML_IDP_METADATA_URL`                                                                                                                                     |
| Issuer, Sign on URL, signing certificate | Read automatically from the metadata URL (refreshed daily)                                                                                                                          |
| Org URL                                  | `ReactTS_Frontend/.env.e2e.local` → `E2E_OKTA_ORG_URL`                                                                                                                              |
| Test users' emails and passwords         | `ReactTS_Frontend/.env.e2e.local` (copy from `.env.e2e.example`) — never commit, never paste into chat. Put passwords in single quotes (`'p#ss'`): an unquoted `#` starts a comment |

The backend `.env` also needs `SESSION_JWT_SECRET` (generate it with the command in `.env.example`) and, for local development, `API_BASE_URL=http://localhost:3000` and `APP_BASE_URL=http://localhost:5173` (these must match the Okta app's ACS and Audience URLs).

Then:

1. Make the first administrator: `npm run bootstrap:admin -- --username <Test Admin's Okta username> --email <their email> --first-name Test --last-name Admin` (in `NestJS_Backend`). Everyone else must be added on the Users page (Okta username, email, Employee/Vendor) before they can sign in.
2. Start the backend (`npm run start:dev`) and frontend (`npm run dev`), open `http://localhost:5173` and choose **Sign in with Okta**.
3. As the administrator, add the other test users on **Users → Add user** (Okta username = their Okta login; the vendor with Type = Vendor) and give them their roles. Someone who signs in before being added is refused and appears under **Refused sign-ins**, ready to add.
4. Run the automated journey: `npm run test:e2e:okta` (in `ReactTS_Frontend`).

Check the metadata is reachable and correct (in Git Bash):

```bash
curl -s "<Metadata URL>" | grep -o 'entityID="[^"]*"'
```

## 11. Troubleshooting

| Symptom                                                                                                | Cause                                                          | Fix                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Form asks for **Configuration guide URL** / rejects `http://`                                          | You are in the OIN Wizard                                      | Section 2: Create App Integration → SAML 2.0                                                                                                 |
| _Invalid property email in expression user.email_                                                      | New expression editor                                          | Use `user.profile.email` (section 3)                                                                                                         |
| **Set up security methods — Required now** (Okta Verify, Passkey)                                      | Default enrollment policy                                      | Section 6                                                                                                                                    |
| _You must enable at least one other multifactor authenticator_                                         | Every MFA method disabled                                      | Set Email to **Optional** (section 6)                                                                                                        |
| _To set Email Enrollment to Optional … enable the email authenticator for authentication and recovery_ | Email is recovery-only                                         | Section 5                                                                                                                                    |
| **Get a verification email** after the password, every time                                            | Signing in through the Okta Dashboard                          | Use the App Embed Link / TechCockpit (section 9)                                                                                             |
| Same prompt the very first time via the App Embed Link                                                 | Email never verified                                           | Complete it once (section 9)                                                                                                                 |
| Policies seem ignored                                                                                  | User not in `Tech Cockpit`, or policy below the Default Policy | Check group membership and priority                                                                                                          |
| Not sure which rule applied                                                                            | —                                                              | System Log, `policy.evaluate_sign_on`, expand "more targets"                                                                                 |
| TechCockpit shows **Sign-in is unavailable**                                                           | Backend cannot load the metadata URL                           | Check `SAML_IDP_METADATA_URL`; behind a corporate proxy start Node with `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY` set                         |
| TechCockpit shows **Sign-in failed**                                                                   | A SAML check failed                                            | Backend log line "SAML sign-in refused (reason)"; check ACS/Audience URLs match `API_BASE_URL`, and signing is on for response and assertion |
| TechCockpit shows **You have not been added to TechCockpit**                                           | Nobody added that Okta username                                | Users → Refused sign-ins → **Add user** (the message shows the username Okta sent)                                                           |
| TechCockpit shows **You do not have access to TechCockpit**                                            | Added, but no role in force                                    | Users → the person → **Assign role**                                                                                                         |
| TechCockpit shows **Sign-in timed out**                                                                | Sign-in started in another tab or took over 10 minutes         | Start again from TechCockpit (not from a bookmarked Okta page)                                                                               |

## 12. Differences for SIT, UAT and production

- One Okta app **per environment**, with that environment's **HTTPS** URLs for the ACS and Audience URI.
- Real users keep **MFA**; sections 5–8 relaxations are only ever for a test-user group in non-production tenants.
- Consider **Assertion Encryption** in production (TechCockpit then provides an encryption certificate).
- Okta's **Application username** must be the Okta username in every environment; TechCockpit's Users page holds who may sign in, their names, Employee/Vendor and roles.
- Production Okta configuration is done by AIA's Okta administrators; hand them sections 2–3 and 12 of this guide.
