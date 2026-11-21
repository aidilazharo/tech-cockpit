# User management in TechCockpit (Okta for sign-in only)

Status: **decided by the product owner, 2026-10-23.** Replaces the Okta-driven provisioning in `requirements-decisions.md` §11 (JIT accounts, vendor flag and names from Okta).

## Why

Managing people in Okta (app assignment, the `userType` vendor flag, names) is tedious. Okta now only proves who someone is; TechCockpit decides who gets in and what they are.

## Sign-in

| Topic | Decision |
|---|---|
| Who can sign in | **Only people added in TechCockpit.** Okta can let everyone in the organisation through; the app decides. |
| Identifier | The **Okta username** (login), sent as the SAML NameID. Matched **ignoring upper/lower case**; unique. |
| Not added | Refused at sign-in, no account created: "You do not have access to TechCockpit. Ask an administrator to add you (your username: …)". Recorded in the audit log and in the **Refused sign-ins** list. |
| Disabled account | Refused (unchanged). |
| From Okta at each sign-in | **Email only**: when Okta sends one it replaces the stored email, and the email can no longer be edited in the app. Names and `userType` from Okta are ignored (the `SAML_VENDOR_USER_TYPES` setting is removed). |

## Users page ("Manage users" holders, `access:user:manage`)

| Field | Add | Edit later (audited) |
|---|---|---|
| Okta username | Required, unique (ignoring case) | Yes (e.g. a typo or an Okta rename); roles and history stay |
| Email | Required | Yes, until Okta has sent one (then read-only, "from Okta") |
| First name, last name | Optional (people without a name are shown by their username) | Yes |
| Employee / Vendor | Required | Yes. Changing to Vendor is refused while the person holds the system administrator role ("End the system administrator role first") |
| Department | Optional | Yes (unchanged) |

- Roles are assigned on the Users page by assignment managers (`access:assignment:manage`), unchanged.
- Disabling and enabling other accounts: "Manage users" holders; nobody disables their own account (unchanged).

## No access

Anyone signed in **without a role in force today** (never assigned, all ended, or only future ones) sees a full "no access" page: their name (or username), how to get access, Sign out. No navigation.

## Refused sign-ins

- Listed on the Users page for "Manage users" holders: Okta username, email and name if Okta sent them, first and last attempt, number of attempts.
- **Add user** pre-fills the form; the entry disappears once the person is added. Admins can **dismiss** an entry.
- Deleted automatically **90 days** after the last attempt (personal data of non-users).

## Existing accounts and setup

- Existing test accounts get their username from their email (no real users yet).
- `npm run bootstrap:admin` takes `--username` and `--email`.
- Okta (once, by the Okta administrator): in the TechCockpit SAML app set **Application username format = Okta username**, keep the `email` attribute statement, and assign the app to everyone who may need TechCockpit.

## Technical notes

- Usernames are stored trimmed and lower-cased (`app_user.username`, unique).
- Email is contact data, not an identity key: it is no longer unique.
