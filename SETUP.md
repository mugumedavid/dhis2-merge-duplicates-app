# Merge Duplicate Tracker Records — Setup

## First-time configuration (superuser required)

1. Log in as a superuser (any account with the ALL authority).
2. Open the app. The Settings panel opens automatically on first use.
3. **Tracker program**: select the program you want to deduplicate records in.
4. **Search attribute**: the dropdown shows searchable and unique attributes for that program. Select the attribute users will search by (typically the client's unique identifier field).
5. **Role required**: optionally select a user role to restrict access to the app. Leave blank to restrict to superusers only.
6. Click **Save settings**. Settings are stored in the DHIS2 dataStore and apply to all users of the instance.

## Access model

- Superusers always have access regardless of the role setting.
- Non-superusers must hold the role selected in settings.
- The Settings panel is visible to all authorised users but only editable by superusers.

## Required user authorities for merging

The user performing a merge must hold:

- **Delete enrollment and associated events** (`F_ENROLLMENT_CASCADE_DELETE`)
- **Delete tracked entity instance and associated enrollments and events** (`F_TRACKED_ENTITY_INSTANCE_DELETE`)

The app checks for these before enabling the Merge button and shows a clear warning if any are missing.

The merging user must also have **capture organisation unit access** covering all facilities whose records they may need to merge.

## Build and install

```bash
npm install
npm run build   # outputs to build/
npm run pack    # creates merge-duplicates-<version>.zip
```

Upload the `.zip` via DHIS2 App Management, or use the `deploy.sh` script (see below).

## Quick deploy script

`deploy.sh` builds, packs, and uploads the app to a DHIS2 instance in one step.
Edit the credentials at the top of the file before running:

```bash
DHIS2_URL="https://your-dhis2-instance"
DHIS2_USER="admin"
DHIS2_PASS="your-password"
```

Then run:

```bash
bash deploy.sh
```

## Merge behaviour

When **Merge into this** is clicked:

1. All events from the source enrollment are copied to the target enrollment, with a transfer note embedded on each event.
2. The original events on the source enrollment are deleted.
3. The source enrollment is deleted.
4. The source TEI is deleted.
5. An audit note is added to the target enrollment recording the merge date, user, and source identifier.

This operation is irreversible. The app prompts for confirmation before proceeding.
