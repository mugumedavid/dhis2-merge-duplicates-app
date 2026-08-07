# Merge Duplicates App — Setup

## No hardcoded UIDs

All configuration (program, search attribute, access role) is stored in the DHIS2
dataStore under `merge-duplicates-app/config` and managed through an in-app Settings panel.

## First-time configuration (superuser required)

1. Log in as a superuser (admin account or any account with ALL authority).
2. Open the app. The Settings panel opens automatically.
3. **Tracker program**: select "Jamaica - Outreach Reporting Form" (or whatever the target program is).
4. **Search attribute**: the dropdown shows searchable/unique attributes of that program.
   Select the UIC attribute (PRVN - UIC).
5. **Role required**: select "PRVN - Merge Authorized" to restrict access.
   Leave blank to restrict to superusers only.
6. Click **Save settings**. Settings are saved to the DHIS2 dataStore and apply to all users.

## Access model

- Superusers always have access (regardless of role setting).
- Non-superusers need the role selected in settings (default: no one else can access).
- The Settings panel is visible to all authorised users but only editable by superusers.

## Build and install

```bash
cd src/dhis2-apps/merge-duplicates
npm install
npm run build   # outputs to build/
npm run pack    # creates .zip for DHIS2 App Management
```

Upload the `.zip` via DHIS2 App Management.

## Merge behaviour

When "Merge into this" is clicked:
1. All events from the other enrollment are re-assigned to this enrollment (tracker UPDATE).
2. The other enrollment is deleted.
3. The other TEI is deleted.

Irreversible. Requires confirmation before proceeding.
