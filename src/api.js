const DATASTORE_NS = 'merge-duplicates-app'
const DATASTORE_KEY = 'config'

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
    return result.trackedEntities.instances || []
}

export async function getEnrollment(engine, teiUid, programUid) {
    const result = await engine.query({
        enrollments: {
            resource: 'tracker/enrollments',
            params: {
                trackedEntity: teiUid,
                program: programUid,
                fields: 'enrollment,enrolledAt,status,orgUnit,orgUnitName',
                paging: false,
            },
        },
    })
    return (result.enrollments.instances || [])[0] || null
}

export async function getEnrollmentEvents(engine, enrollmentUid) {
    const result = await engine.query({
        events: {
            resource: 'tracker/events',
            params: {
                enrollment: enrollmentUid,
                fields: 'event,programStage,programStageName,occurredAt,status,dataValues',
                pageSize: 1000,
            },
        },
    })
    return result.events.instances || []
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

export async function mergeEnrollments(engine, targetEnrollmentUid, sourceEnrollmentUid, sourceTeiUid) {
    const events = await getEnrollmentEvents(engine, sourceEnrollmentUid)

    if (events.length > 0) {
        const updatedEvents = events.map(ev => ({
            ...ev,
            enrollment: targetEnrollmentUid,
        }))
        await engine.mutate({
            type: 'create',
            resource: 'tracker',
            params: { importStrategy: 'UPDATE', async: false },
            data: { events: updatedEvents },
        })
    }

    await engine.mutate({
        type: 'delete',
        resource: `enrollments/${sourceEnrollmentUid}`,
    })

    await engine.mutate({
        type: 'delete',
        resource: `trackedEntityInstances/${sourceTeiUid}`,
    })
}

export function isSuperuser(currentUser) {
    return (currentUser?.authorities || []).includes('ALL')
}

export function userHasAccess(currentUser, accessRoleUid) {
    if (isSuperuser(currentUser)) return true
    if (!accessRoleUid) return false
    return (currentUser?.userRoles || []).some(r => r.id === accessRoleUid)
}
