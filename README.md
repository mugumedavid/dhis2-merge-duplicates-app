# Merge Duplicate Tracker Records

A DHIS2 custom app for identifying and merging duplicate tracker enrollments within any tracker program.

## Overview

When two records exist in DHIS2 for the same person (e.g. enrolled twice under the same unique identifier), this app allows an authorised user to search for both records side by side, compare their attributes, and merge them into a single clean record. All events from the source record are transferred to the target, and the duplicate is permanently deleted.

The app is fully generic: it works with any DHIS2 tracker program. Program, search attribute, and access role are configured once by a superuser and stored in the DHIS2 dataStore.

## Requirements

- DHIS2 2.40 to 2.43
- A tracker program (WITH_REGISTRATION)
- The merging user must hold the following DHIS2 authorities:
  - Delete enrollment and associated events (`F_ENROLLMENT_CASCADE_DELETE`)
  - Delete tracked entity instance and associated enrollments and events (`F_TRACKED_ENTITY_INSTANCE_DELETE`)
- The merging user must have capture organisation unit access covering all facilities involved in a merge

## Installation

Download the latest release zip from the [Releases](https://github.com/mugumedavid/dhis2-merge-duplicates-app/releases) page and install it via the DHIS2 App Management app, or use the DHIS2 App Hub.

To build from source:

```bash
npm install
npm run build
npm run pack
```

The packaged zip will appear at `merge-duplicates-<version>.zip`. Upload it through DHIS2 App Management.

Alternatively, use the included `deploy.sh` script to build, pack, and upload in one step. Edit the credentials at the top of the file to match your instance before running:

```bash
DHIS2_URL="https://your-dhis2-instance"
DHIS2_USER="admin"
DHIS2_PASS="your-password"
```

```bash
bash deploy.sh
```

## First-time setup

1. Log in as a superuser.
2. Open the app and click **Settings**.
3. Select the **Tracker program** you want to deduplicate.
4. Select the **Search attribute** (the unique identifier field users will search by, e.g. a client ID).
5. Optionally select the **Role required to use this app** to restrict access to a specific user role.
6. Click **Save settings**.

Settings are stored in the DHIS2 dataStore under the namespace `merge-duplicates-app` and are shared across all users of the instance.

## Using the app

1. Search for the first record (the one to keep) in the left panel using the configured search attribute or the TEI ID.
2. Search for the duplicate record in the right panel.
3. Review the side-by-side attribute comparison. Rows highlighted in yellow differ between the two records.
4. Click **Merge into this** on the panel whose record you want to keep.
5. Confirm the merge in the dialog.

The app will:
- Copy all events from the source record to the target enrollment, embedding a transfer note on each event
- Delete the original events from the source
- Delete the source enrollment and TEI
- Add an audit note to the target enrollment recording the merge

## Merge audit trail

Every merge leaves notes in DHIS2 that future users can read:

- Each transferred event receives a note: `Transferred from enrollment <uid> (identifier: <value>) during merge on <date> by <username>.`
- The surviving enrollment receives a note: `Merged from identifier <value> (TEI: <uid>) on <date> by <username>.`

## Permissions warning

If the logged-in user is missing a required authority, the app shows a warning and disables the Merge button. The warning lists the missing authorities by their human-readable name so an administrator knows exactly what to add to the user role.

## Architecture notes

- No hardcoded UIDs. All program and attribute references are resolved at runtime from configuration.
- App configuration is stored in DHIS2 dataStore (`merge-duplicates-app/config`) and is shared across all users.
- The app works around a DHIS2 2.40 limitation where the `enrollment` field cannot be updated on existing events (error E1128) by creating new event copies under the target enrollment and deleting the originals, rather than updating in place.
- A known DHIS2 2.40 bug causes the `enrollment` filter on `tracker/events` to be ignored when the `program` parameter is also present. The app works around this by querying by `trackedEntity` and filtering client-side.

## Development

```bash
npm install
npm start
```

The dev server proxies to a DHIS2 instance. Set the target in `d2.config.js` or via the `DHIS2_BASE_URL` environment variable.

## AI use

Parts of this project, including portions of the code and this documentation, were produced with the help of AI coding assistants. All AI-assisted output was reviewed and tested by the maintainer before release.

## License

BSD 2-Clause. See [LICENSE](LICENSE).
