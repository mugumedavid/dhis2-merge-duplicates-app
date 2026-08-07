const DATASTORE_NS = 'merge-duplicates-app'
const DATASTORE_KEY = 'config'

export const TEI_ID_SENTINEL = '__TEI_ID__'
export const TEI_ID_OPTION = { id: TEI_ID_SENTINEL, displayName: 'Tracked Entity Instance Id - TEI ID', unique: true }

export async function loadConfig(engine) {
    try {
        const result = await engine.query({
            config: { resource: `dataStore/${DATASTORE_NS}/${DATASTORE_KEY}` },
        })
        return result.config
    } catch {
        return {}
    }
}

export async function saveConfig(engine, config) {
    // Try PUT first (update); fall back to POST (create)
    try {
        await engine.mutate({
            type: 'update',
            resource: `dataStore/${DATASTORE_NS}/${DATASTORE_KEY}`,
            data: config,
        })
    } catch {
        await engine.mutate({
            type: 'create',
            resource: `dataStore/${DATASTORE_NS}/${DATASTORE_KEY}`,
            data: config,
        })
    }
}

export async function getTrackerPrograms(engine) {
    const result = await engine.query({
        programs: {
            resource: 'programs',
            params: {
                filter: 'programType:eq:WITH_REGISTRATION',
                fields: 'id,displayName',
                paging: false,
            },
        },
    })
    return (result.programs.programs || []).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
    )
}

export async function getProgramAttributes(engine, programUid) {
    const result = await engine.query({
        program: {
            resource: `programs/${programUid}`,
            params: {
                fields: 'programTrackedEntityAttributes[trackedEntityAttribute[id,displayName,unique,valueType],searchable]',
            },
        },
    })
    const pteas = result.program.programTrackedEntityAttributes || []
    const all = pteas.map(p => ({
        ...p.trackedEntityAttribute,
        searchable: p.searchable,
    }))

    // Prefer searchable or unique attributes as search candidates
    const searchable = all.filter(a => a.searchable || a.unique)
    return searchable.length > 0 ? searchable : all
}

export async function getUserRoles(engine) {
    const result = await engine.query({
        roles: {
            resource: 'userRoles',
            params: { fields: 'id,displayName', paging: false },
        },
    })
    return (result.roles.userRoles || []).sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
    )
}

export async function searchByAttribute(engine, programUid, attributeUid, value) {
    if (attributeUid === TEI_ID_SENTINEL) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{10}$/.test(value)) {
            throw new Error('TEI ID must be an 11-character alphanumeric code starting with a letter (e.g. Rk8dW4JgOzL).')
        }
        const result = await engine.query({
            tei: {
                resource: `tracker/trackedEntities/${value}`,
                params: { fields: 'trackedEntity,attributes[attribute,displayName,value]' },
            },
        })
        return result.tei?.trackedEntity ? [result.tei] : []
    }

    const result = await engine.query({
        trackedEntities: {
            resource: 'tracker/trackedEntities',
            params: {
                program: programUid,
                filter: `${attributeUid}:eq:${value}`,
                fields: 'trackedEntity,attributes[attribute,displayName,value]',
                ouMode: 'ALL',
                paging: false,
            },
        },
    })
    const r = result.trackedEntities
    return r.trackedEntities || r.instances || []
}

export async function getEnrollment(engine, teiUid, programUid) {
    const result = await engine.query({
        enrollments: {
            resource: 'tracker/enrollments',
            params: {
                trackedEntity: teiUid,
                program: programUid,
                fields: 'enrollment,enrolledAt,status,orgUnit',
                paging: false,
            },
        },
    })
    const r = result.enrollments
    const enrollment = (r.enrollments || r.instances || [])[0] || null
    if (!enrollment) return null

    // Resolve org unit name separately (tracker API only returns the UID)
    const ouResult = await engine.query({
        ou: {
            resource: `organisationUnits/${enrollment.orgUnit}`,
            params: { fields: 'displayName' },
        },
    })
    enrollment.orgUnitName = ouResult.ou.displayName || enrollment.orgUnit
    return enrollment
}

export async function getEnrollmentEvents(engine, enrollmentUid, programUid, teiUid) {
    // The tracker/events endpoint ignores the `enrollment` filter when `program` is
    // also present (DHIS2 2.40 bug). Query by trackedEntity instead and filter client-side.
    const result = await engine.query({
        events: {
            resource: 'tracker/events',
            params: {
                trackedEntity: teiUid,
                program: programUid,
                fields: 'event,program,programStage,orgUnit,occurredAt,completedAt,completedBy,status,followUp,attributeOptionCombo,notes,dataValues,enrollment',
                pageSize: 1000,
            },
        },
    })
    const r = result.events
    const all = r.events || r.instances || []
    return all.filter(ev => ev.enrollment === enrollmentUid)
}

export async function getProgramStages(engine, programUid) {
    const result = await engine.query({
        program: {
            resource: `programs/${programUid}`,
            params: { fields: 'programStages[id,displayName]' },
        },
    })
    return result.program.programStages || []
}

export async function mergeEnrollments(engine, targetEnrollmentUid, sourceEnrollmentUid, sourceTeiUid, programUid, sourceIdentifier, username) {
    const events = await getEnrollmentEvents(engine, sourceEnrollmentUid, programUid, sourceTeiUid)
    const today = new Date().toISOString().slice(0, 10)

    if (events.length > 0) {
        const transferNote = {
            value: `Transferred from enrollment ${sourceEnrollmentUid} (identifier: ${sourceIdentifier}) during merge on ${today} by ${username}.`,
        }

        // DHIS2 2.40 does not allow updating the enrollment field on existing events (E1128).
        // Workaround: create new copies under the target enrollment, then delete the originals.
        // Drop system-managed fields; keep everything else (occurredAt, completedAt,
        // completedBy, orgUnit, status, attributeOptionCombo, notes, dataValues, followUp)
        const copies = events.map(({
            event, enrollment, trackedEntity,
            createdAt, updatedAt, createdBy, updatedBy, deleted,
            ...rest
        }) => ({
            ...rest,
            enrollment: targetEnrollmentUid,
            notes: [...(rest.notes || []), transferNote],
        }))

        try {
            await engine.mutate({
                type: 'create',
                resource: 'tracker',
                params: { importStrategy: 'CREATE', async: false },
                data: { events: copies },
            })
        } catch (e) {
            throw new Error(
                `Could not copy events to the target enrollment. No data has been changed. ` +
                `Fix: ${e.message}`
            )
        }

        try {
            await engine.mutate({
                type: 'create',
                resource: 'tracker',
                params: { importStrategy: 'DELETE', async: false },
                data: { events: events.map(ev => ({ event: ev.event })) },
            })
        } catch (e) {
            throw new Error(
                `Events were copied to the target enrollment but the originals could not be deleted — ` +
                `both enrollments may now have duplicate events. ` +
                `An administrator must manually remove the duplicate events from source enrollment ${sourceEnrollmentUid}. ` +
                `Fix: ${e.message}`
            )
        }
    }

    // Delete source enrollment (now empty) then the TEI
    try {
        await engine.mutate({
            type: 'create',
            resource: 'tracker',
            params: { importStrategy: 'DELETE', async: false },
            data: { enrollments: [{ enrollment: sourceEnrollmentUid }] },
        })
    } catch (e) {
        throw new Error(
            `Events were transferred successfully but the source enrollment (${sourceEnrollmentUid}) could not be deleted. ` +
            `An administrator must manually delete this enrollment and its TEI (${sourceTeiUid}). ` +
            `Fix: ${e.message}`
        )
    }

    try {
        await engine.mutate({
            type: 'create',
            resource: 'tracker',
            params: { importStrategy: 'DELETE', async: false },
            data: { trackedEntities: [{ trackedEntity: sourceTeiUid }] },
        })
    } catch (e) {
        throw new Error(
            `Events were transferred and the source enrollment was deleted, but the source TEI (${sourceTeiUid}) could not be deleted. ` +
            `An administrator must manually delete this record. ` +
            `Fix: ${e.message}`
        )
    }

    // Leave a note on the winner enrollment recording what was merged in.
    // Non-fatal: the merge is complete at this point; a failed note is just cosmetic.
    try {
        await engine.mutate({
            type: 'create',
            resource: 'tracker',
            params: { importStrategy: 'UPDATE', async: false },
            data: {
                enrollments: [{
                    enrollment: targetEnrollmentUid,
                    notes: [{
                        value: `Merged from identifier ${sourceIdentifier} (TEI: ${sourceTeiUid}) on ${today} by ${username}.`,
                    }],
                }],
            },
        })
    } catch {
        // Merge succeeded; audit note could not be written but data is intact
    }
}

// Authorities required to complete every step of a merge
const REQUIRED_MERGE_AUTHORITIES = [
    { code: 'F_ENROLLMENT_CASCADE_DELETE',      label: 'Delete enrollment and associated events' },
    { code: 'F_TRACKED_ENTITY_INSTANCE_DELETE', label: 'Delete tracked entity instance and associated enrollments and events' },
]

export function isSuperuser(currentUser) {
    return (currentUser?.authorities || []).includes('ALL')
}

// Returns an array of { code, label } for any required authorities the user is missing
export function getMissingMergeAuthorities(currentUser) {
    if (isSuperuser(currentUser)) return []
    const has = new Set(currentUser?.authorities || [])
    return REQUIRED_MERGE_AUTHORITIES.filter(a => !has.has(a.code))
}

export function userHasAccess(currentUser, accessRoleUid) {
    if (isSuperuser(currentUser)) return true
    if (!accessRoleUid) return false
    return (currentUser?.userRoles || []).some(r => r.id === accessRoleUid)
}
