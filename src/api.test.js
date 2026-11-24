import {
    isSuperuser,
    getMissingMergeAuthorities,
    userHasAccess,
    loadConfig,
    saveConfig,
    searchByAttribute,
    getEnrollmentEvents,
    mergeEnrollments,
    TEI_ID_SENTINEL,
} from './api'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TARGET_UID   = 'targetEnrUid1'
const SOURCE_UID   = 'sourceEnrUid1'
const SOURCE_TEI   = 'sourceTeiUid1'
const PROGRAM_UID  = 'programUid111'
const ATTR_UID     = 'attributeUid1'

const targetEnrollmentData = {
    enrollment:    TARGET_UID,
    program:       PROGRAM_UID,
    orgUnit:       'orgUnit11111',
    trackedEntity: 'targetTeiUid1',
    enrolledAt:    '2024-01-01',
    status:        'ACTIVE',
}

const makeEvent = (id, overrides = {}) => ({
    event:                id,
    enrollment:           SOURCE_UID,
    program:              PROGRAM_UID,
    programStage:         'stage1111111',
    orgUnit:              'orgUnit11111',
    occurredAt:           '2024-06-01T00:00:00.000Z',
    status:               'COMPLETED',
    dataValues:           [{ dataElement: 'de1', value: 'x' }],
    notes:                [],
    followUp:             false,
    attributeOptionCombo: 'HllvX50cXC0',
    ...overrides,
})

const scheduleEvent = (id) =>
    makeEvent(id, { status: 'SCHEDULE', dataValues: [], occurredAt: null })

// ---------------------------------------------------------------------------
// Engine mock — reset before every test
// ---------------------------------------------------------------------------

let engine
beforeEach(() => {
    engine = { query: jest.fn(), mutate: jest.fn() }
})

// ---------------------------------------------------------------------------
// isSuperuser
// ---------------------------------------------------------------------------

describe('isSuperuser', () => {
    const user = (authorities) => ({ authorities })

    it('returns true when user has ALL authority', () => {
        expect(isSuperuser(user(['ALL']))).toBe(true)
    })

    it('returns true when user has F_SYSTEM_SETTING authority', () => {
        expect(isSuperuser(user(['F_SYSTEM_SETTING']))).toBe(true)
    })

    it('returns true when user has both ALL and F_SYSTEM_SETTING', () => {
        expect(isSuperuser(user(['ALL', 'F_SYSTEM_SETTING']))).toBe(true)
    })

    it('returns false when user has merge authorities but not a superuser authority', () => {
        expect(isSuperuser(user(['F_ENROLLMENT_CASCADE_DELETE', 'F_TEI_CASCADE_DELETE']))).toBe(false)
    })

    it('returns false for empty authority list', () => {
        expect(isSuperuser(user([]))).toBe(false)
    })

    it('returns false when currentUser is null', () => {
        expect(isSuperuser(null)).toBe(false)
    })

    it('returns false when currentUser is undefined', () => {
        expect(isSuperuser(undefined)).toBe(false)
    })

    it('returns false when currentUser has no authorities key', () => {
        expect(isSuperuser({})).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// getMissingMergeAuthorities
// ---------------------------------------------------------------------------

describe('getMissingMergeAuthorities', () => {
    const user = (authorities) => ({ authorities })

    it('returns [] for superuser with ALL', () => {
        expect(getMissingMergeAuthorities(user(['ALL']))).toEqual([])
    })

    it('returns [] for superuser with F_SYSTEM_SETTING', () => {
        expect(getMissingMergeAuthorities(user(['F_SYSTEM_SETTING']))).toEqual([])
    })

    it('returns [] when user has both required authorities', () => {
        expect(getMissingMergeAuthorities(
            user(['F_ENROLLMENT_CASCADE_DELETE', 'F_TEI_CASCADE_DELETE'])
        )).toEqual([])
    })

    it('returns F_TEI_CASCADE_DELETE when only F_ENROLLMENT_CASCADE_DELETE is present', () => {
        const result = getMissingMergeAuthorities(user(['F_ENROLLMENT_CASCADE_DELETE']))
        expect(result).toHaveLength(1)
        expect(result[0].code).toBe('F_TEI_CASCADE_DELETE')
        expect(result[0].label).toBeTruthy()
    })

    it('returns F_ENROLLMENT_CASCADE_DELETE when only F_TEI_CASCADE_DELETE is present', () => {
        const result = getMissingMergeAuthorities(user(['F_TEI_CASCADE_DELETE']))
        expect(result).toHaveLength(1)
        expect(result[0].code).toBe('F_ENROLLMENT_CASCADE_DELETE')
        expect(result[0].label).toBeTruthy()
    })

    it('returns both required authorities when user has neither', () => {
        const result = getMissingMergeAuthorities(user([]))
        expect(result).toHaveLength(2)
        const codes = result.map(a => a.code)
        expect(codes).toContain('F_ENROLLMENT_CASCADE_DELETE')
        expect(codes).toContain('F_TEI_CASCADE_DELETE')
    })

    it('F_TRACKED_ENTITY_INSTANCE_DELETE (the decoy) does NOT satisfy F_TEI_CASCADE_DELETE', () => {
        const result = getMissingMergeAuthorities(user(['F_TRACKED_ENTITY_INSTANCE_DELETE']))
        expect(result).toHaveLength(2)
        const codes = result.map(a => a.code)
        expect(codes).toContain('F_TEI_CASCADE_DELETE')
        expect(codes).toContain('F_ENROLLMENT_CASCADE_DELETE')
    })

    it('returns both when currentUser is null', () => {
        const result = getMissingMergeAuthorities(null)
        expect(result).toHaveLength(2)
    })

    it('each returned entry has code and label strings', () => {
        const result = getMissingMergeAuthorities(user([]))
        result.forEach(entry => {
            expect(typeof entry.code).toBe('string')
            expect(entry.code.length).toBeGreaterThan(0)
            expect(typeof entry.label).toBe('string')
            expect(entry.label.length).toBeGreaterThan(0)
        })
    })
})

// ---------------------------------------------------------------------------
// userHasAccess
// ---------------------------------------------------------------------------

describe('userHasAccess', () => {
    const superuser  = { authorities: ['ALL'], userRoles: [] }
    const noRoleUser = { authorities: [], userRoles: [] }
    const withRole   = (uid) => ({ authorities: [], userRoles: [{ id: uid }] })

    it('superuser is always granted access regardless of role UID', () => {
        expect(userHasAccess(superuser, 'someRoleUid')).toBe(true)
    })

    it('returns true when no accessRoleUid is configured (null)', () => {
        expect(userHasAccess(noRoleUser, null)).toBe(true)
    })

    it('returns true when no accessRoleUid is configured (undefined)', () => {
        expect(userHasAccess(noRoleUser, undefined)).toBe(true)
    })

    it('returns true when no accessRoleUid is configured (empty string)', () => {
        expect(userHasAccess(noRoleUser, '')).toBe(true)
    })

    it('returns true when user has the required role', () => {
        expect(userHasAccess(withRole('abc123'), 'abc123')).toBe(true)
    })

    it('returns false when user does not have the required role', () => {
        expect(userHasAccess(withRole('abc123'), 'xyz999')).toBe(false)
    })

    it('returns false when user has no roles at all', () => {
        expect(userHasAccess(noRoleUser, 'abc123')).toBe(false)
    })

    it('returns false when user has no userRoles key', () => {
        const userWithoutRoles = { authorities: [] }
        expect(userHasAccess(userWithoutRoles, 'abc123')).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
    it('returns the config object from dataStore on success', async () => {
        const cfg = { programUid: 'abc', accessRoleUid: null }
        engine.query.mockResolvedValueOnce({ config: cfg })
        const result = await loadConfig(engine)
        expect(result).toEqual(cfg)
    })

    it('queries the correct dataStore resource', async () => {
        engine.query.mockResolvedValueOnce({ config: {} })
        await loadConfig(engine)
        const arg = engine.query.mock.calls[0][0]
        expect(arg.config.resource).toBe('dataStore/merge-duplicates-app/config')
    })

    it('returns {} when the query rejects (e.g. 404 key not found)', async () => {
        engine.query.mockRejectedValueOnce(new Error('404 Not Found'))
        const result = await loadConfig(engine)
        expect(result).toEqual({})
    })

    it('does not throw when the query rejects', async () => {
        engine.query.mockRejectedValueOnce(new Error('network error'))
        await expect(loadConfig(engine)).resolves.not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// saveConfig
// ---------------------------------------------------------------------------

describe('saveConfig', () => {
    const cfg = { programUid: 'abc', attributeUid: 'def' }

    it('uses update (PUT) on the first attempt', async () => {
        engine.mutate.mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate).toHaveBeenCalledTimes(1)
        expect(engine.mutate.mock.calls[0][0].type).toBe('update')
    })

    it('targets the correct dataStore resource', async () => {
        engine.mutate.mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate.mock.calls[0][0].resource).toBe('dataStore/merge-duplicates-app/config')
    })

    it('passes the config data through unchanged', async () => {
        engine.mutate.mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate.mock.calls[0][0].data).toEqual(cfg)
    })

    it('does not fall back to create when update succeeds', async () => {
        engine.mutate.mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate).toHaveBeenCalledTimes(1)
    })

    it('falls back to create (POST) when update rejects', async () => {
        engine.mutate
            .mockRejectedValueOnce(new Error('conflict'))
            .mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate).toHaveBeenCalledTimes(2)
        expect(engine.mutate.mock.calls[1][0].type).toBe('create')
    })

    it('passes the same config data to the fallback create call', async () => {
        engine.mutate
            .mockRejectedValueOnce(new Error('conflict'))
            .mockResolvedValueOnce({})
        await saveConfig(engine, cfg)
        expect(engine.mutate.mock.calls[1][0].data).toEqual(cfg)
    })

    it('propagates the error when both update and create reject', async () => {
        engine.mutate
            .mockRejectedValueOnce(new Error('update failed'))
            .mockRejectedValueOnce(new Error('create also failed'))
        await expect(saveConfig(engine, cfg)).rejects.toThrow('create also failed')
    })
})

// ---------------------------------------------------------------------------
// searchByAttribute — TEI_ID_SENTINEL path
// ---------------------------------------------------------------------------

describe('searchByAttribute', () => {
    describe('when attributeUid is TEI_ID_SENTINEL', () => {
        const VALID_UID = 'Rk8dW4JgOzL'

        it('resolves and queries the single-TEI endpoint for a valid 11-char UID', async () => {
            engine.query.mockResolvedValueOnce({
                tei: { trackedEntity: VALID_UID, attributes: [] },
            })
            await searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, VALID_UID)
            const arg = engine.query.mock.calls[0][0]
            expect(arg.tei.resource).toBe(`tracker/trackedEntities/${VALID_UID}`)
        })

        it('returns the TEI wrapped in an array when trackedEntity field is present', async () => {
            const teiObj = { trackedEntity: VALID_UID, attributes: [] }
            engine.query.mockResolvedValueOnce({ tei: teiObj })
            const result = await searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, VALID_UID)
            expect(result).toEqual([teiObj])
        })

        it('returns [] when response has no trackedEntity field', async () => {
            engine.query.mockResolvedValueOnce({ tei: {} })
            const result = await searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, VALID_UID)
            expect(result).toEqual([])
        })

        it('throws for a value that is too short (10 chars)', async () => {
            await expect(
                searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, 'Abcdefghij')
            ).rejects.toThrow(/11-character/i)
        })

        it('throws for a value that is too long (12 chars)', async () => {
            await expect(
                searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, 'Abcdefghijkl')
            ).rejects.toThrow(/11-character/i)
        })

        it('throws when the value starts with a digit', async () => {
            await expect(
                searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, '1k8dW4JgOzL')
            ).rejects.toThrow(/11-character/i)
        })

        it('throws when the value contains a special character', async () => {
            await expect(
                searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, 'Rk8dW4JgOz!')
            ).rejects.toThrow(/11-character/i)
        })

        it('does not call engine.query when the UID format is invalid', async () => {
            await expect(
                searchByAttribute(engine, PROGRAM_UID, TEI_ID_SENTINEL, 'bad')
            ).rejects.toThrow()
            expect(engine.query).not.toHaveBeenCalled()
        })
    })

    describe('normal attribute search', () => {
        it('returns the trackedEntities array from a standard response shape', async () => {
            const teis = [{ trackedEntity: 'tei1' }, { trackedEntity: 'tei2' }]
            engine.query.mockResolvedValueOnce({ trackedEntities: { trackedEntities: teis } })
            const result = await searchByAttribute(engine, PROGRAM_UID, ATTR_UID, 'value1')
            expect(result).toEqual(teis)
        })

        it('returns the instances array from the DHIS2 2.40 alternate response shape', async () => {
            const teis = [{ trackedEntity: 'tei1' }]
            engine.query.mockResolvedValueOnce({ trackedEntities: { instances: teis } })
            const result = await searchByAttribute(engine, PROGRAM_UID, ATTR_UID, 'value1')
            expect(result).toEqual(teis)
        })

        it('returns [] when trackedEntities array is empty', async () => {
            engine.query.mockResolvedValueOnce({ trackedEntities: { trackedEntities: [] } })
            const result = await searchByAttribute(engine, PROGRAM_UID, ATTR_UID, 'value1')
            expect(result).toEqual([])
        })

        it('sends the correct query parameters', async () => {
            engine.query.mockResolvedValueOnce({ trackedEntities: { trackedEntities: [] } })
            await searchByAttribute(engine, PROGRAM_UID, ATTR_UID, 'myValue')
            const params = engine.query.mock.calls[0][0].trackedEntities.params
            expect(params.program).toBe(PROGRAM_UID)
            expect(params.filter).toBe(`${ATTR_UID}:eq:myValue`)
            expect(params.ouMode).toBe('ALL')
            expect(params.paging).toBe(false)
        })
    })
})

// ---------------------------------------------------------------------------
// getEnrollmentEvents
// ---------------------------------------------------------------------------

describe('getEnrollmentEvents', () => {
    const makeRemoteEvent = (id, enrollmentId) => ({
        event: id,
        enrollment: enrollmentId,
        program: PROGRAM_UID,
        status: 'COMPLETED',
    })

    it('returns all events that match the enrollment UID', async () => {
        const e1 = makeRemoteEvent('ev1', SOURCE_UID)
        const e2 = makeRemoteEvent('ev2', SOURCE_UID)
        engine.query.mockResolvedValueOnce({ events: { events: [e1, e2] } })
        const result = await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        expect(result).toEqual([e1, e2])
    })

    it('filters out events belonging to a different enrollment (client-side fix for DHIS2 2.40 bug)', async () => {
        const e1 = makeRemoteEvent('ev1', SOURCE_UID)
        const e2 = makeRemoteEvent('ev2', SOURCE_UID)
        const e3 = makeRemoteEvent('ev3', 'otherEnrUid1')
        engine.query.mockResolvedValueOnce({ events: { events: [e1, e2, e3] } })
        const result = await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        expect(result).toEqual([e1, e2])
        expect(result.find(e => e.event === 'ev3')).toBeUndefined()
    })

    it('handles the DHIS2 2.40 instances response shape', async () => {
        const e1 = makeRemoteEvent('ev1', SOURCE_UID)
        engine.query.mockResolvedValueOnce({ events: { instances: [e1] } })
        const result = await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        expect(result).toEqual([e1])
    })

    it('returns [] when the event list is empty', async () => {
        engine.query.mockResolvedValueOnce({ events: { events: [] } })
        const result = await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        expect(result).toEqual([])
    })

    it('returns [] when all events belong to a different enrollment', async () => {
        const e1 = makeRemoteEvent('ev1', 'wrongEnrUid1')
        engine.query.mockResolvedValueOnce({ events: { events: [e1] } })
        const result = await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        expect(result).toEqual([])
    })

    it('queries by trackedEntity and program (not by enrollment — DHIS2 2.40 bug workaround)', async () => {
        engine.query.mockResolvedValueOnce({ events: { events: [] } })
        await getEnrollmentEvents(engine, SOURCE_UID, PROGRAM_UID, SOURCE_TEI)
        const params = engine.query.mock.calls[0][0].events.params
        expect(params.trackedEntity).toBe(SOURCE_TEI)
        expect(params.program).toBe(PROGRAM_UID)
    })
})

// ---------------------------------------------------------------------------
// mergeEnrollments
// ---------------------------------------------------------------------------

describe('mergeEnrollments', () => {
    // Helper: set up engine.query for target enrollment + events, and chain mutate resolves.
    // mutateResponses: array of 'resolve' | 'reject' for each expected mutate call in order.
    const setup = (sourceEvents, mutateResponses = []) => {
        engine.query
            .mockResolvedValueOnce({ enrollment: targetEnrollmentData })
            .mockResolvedValueOnce({ events: { events: sourceEvents } })
        let chain = engine.mutate
        mutateResponses.forEach(r => {
            chain = r === 'reject'
                ? chain.mockRejectedValueOnce(new Error('server error'))
                : chain.mockResolvedValueOnce({})
        })
    }

    const callMerge = () =>
        mergeEnrollments(
            engine,
            TARGET_UID, SOURCE_UID, SOURCE_TEI, PROGRAM_UID,
            'SA0120130805F', 'admin'
        )

    // --- Scenario A: no source events at all ---

    describe('Scenario A: no source events', () => {
        beforeEach(() => setup([], ['resolve', 'resolve', 'resolve']))

        it('resolves without throwing', async () => {
            await expect(callMerge()).resolves.not.toThrow()
        })

        it('returns 0 events transferred', async () => {
            expect(await callMerge()).toBe(0)
        })

        it('calls mutate exactly 3 times (DELETE enrollment, DELETE TEI, UPDATE note)', async () => {
            await callMerge()
            expect(engine.mutate).toHaveBeenCalledTimes(3)
        })

        it('never calls CREATE', async () => {
            await callMerge()
            const calls = engine.mutate.mock.calls
            const hasCreate = calls.some(([arg]) => arg.params?.importStrategy === 'CREATE')
            expect(hasCreate).toBe(false)
        })

        it('first mutate deletes the enrollment', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[0]
            expect(arg.params.importStrategy).toBe('DELETE')
            expect(arg.data.enrollments).toBeDefined()
        })

        it('second mutate deletes the TEI', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[1]
            expect(arg.params.importStrategy).toBe('DELETE')
            expect(arg.data.trackedEntities).toBeDefined()
        })
    })

    // --- Scenario B: only empty SCHEDULE events ---

    describe('Scenario B: only empty SCHEDULE events', () => {
        beforeEach(() => setup(
            [scheduleEvent('evS1'), scheduleEvent('evS2')],
            ['resolve', 'resolve', 'resolve', 'resolve']
        ))

        it('returns 0 (empty SCHEDULE events are not counted as transferred)', async () => {
            expect(await callMerge()).toBe(0)
        })

        it('never calls CREATE (no events to copy)', async () => {
            await callMerge()
            const hasCreate = engine.mutate.mock.calls.some(
                ([arg]) => arg.params?.importStrategy === 'CREATE'
            )
            expect(hasCreate).toBe(false)
        })

        it('first mutate DOES delete the source events (SCHEDULE events are deleted)', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[0]
            expect(arg.params.importStrategy).toBe('DELETE')
            expect(arg.data.events).toHaveLength(2)
            const ids = arg.data.events.map(e => e.event)
            expect(ids).toContain('evS1')
            expect(ids).toContain('evS2')
        })

        it('calls mutate exactly 4 times (DELETE events, DELETE enrollment, DELETE TEI, UPDATE note)', async () => {
            await callMerge()
            expect(engine.mutate).toHaveBeenCalledTimes(4)
        })
    })

    // --- Scenario C: normal events only ---

    describe('Scenario C: normal transferable events only', () => {
        beforeEach(() => setup(
            [makeEvent('evA'), makeEvent('evB')],
            ['resolve', 'resolve', 'resolve', 'resolve', 'resolve']
        ))

        it('returns the count of events transferred', async () => {
            expect(await callMerge()).toBe(2)
        })

        it('calls mutate 5 times', async () => {
            await callMerge()
            expect(engine.mutate).toHaveBeenCalledTimes(5)
        })

        it('first mutate is CREATE with both events', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[0]
            expect(arg.params.importStrategy).toBe('CREATE')
            expect(arg.data.events).toHaveLength(2)
        })

        it('copies are assigned to the target enrollment', async () => {
            await callMerge()
            const copies = engine.mutate.mock.calls[0][0].data.events
            copies.forEach(copy => {
                expect(copy.enrollment).toBe(TARGET_UID)
            })
        })

        it('system-managed fields are stripped from copies', async () => {
            await callMerge()
            const copies = engine.mutate.mock.calls[0][0].data.events
            copies.forEach(copy => {
                expect(copy.event).toBeUndefined()
                expect(copy.createdAt).toBeUndefined()
                expect(copy.updatedAt).toBeUndefined()
                expect(copy.createdBy).toBeUndefined()
                expect(copy.updatedBy).toBeUndefined()
                expect(copy.deleted).toBeUndefined()
                expect(copy.trackedEntity).toBeUndefined()
            })
        })

        it('each copy includes a transfer note', async () => {
            await callMerge()
            const copies = engine.mutate.mock.calls[0][0].data.events
            copies.forEach(copy => {
                expect(copy.notes.length).toBeGreaterThan(0)
                const noteText = copy.notes.map(n => n.value).join(' ')
                expect(noteText).toContain(SOURCE_UID)
            })
        })

        it('second mutate deletes all source events', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[1]
            expect(arg.params.importStrategy).toBe('DELETE')
            expect(arg.data.events).toHaveLength(2)
        })
    })

    // --- Scenario D: mixed events — THE KEY REGRESSION TEST ---

    describe('Scenario D: mixed normal + empty SCHEDULE events (regression)', () => {
        beforeEach(() => setup(
            [makeEvent('evA'), makeEvent('evB'), scheduleEvent('evS')],
            ['resolve', 'resolve', 'resolve', 'resolve', 'resolve']
        ))

        it('returns 2, not 3 — count reflects only transferred events', async () => {
            expect(await callMerge()).toBe(2)
        })

        it('CREATE payload contains only 2 events (SCHEDULE excluded)', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[0]
            expect(arg.params.importStrategy).toBe('CREATE')
            expect(arg.data.events).toHaveLength(2)
        })

        it('the SCHEDULE event is not in the CREATE payload', async () => {
            await callMerge()
            const copies = engine.mutate.mock.calls[0][0].data.events
            const statuses = copies.map(c => c.status)
            expect(statuses).not.toContain('SCHEDULE')
        })

        it('DELETE events payload contains all 3 events including the SCHEDULE one', async () => {
            await callMerge()
            const deleteCall = engine.mutate.mock.calls.find(
                ([arg]) => arg.params?.importStrategy === 'DELETE' && arg.data.events
            )
            expect(deleteCall[0].data.events).toHaveLength(3)
            const ids = deleteCall[0].data.events.map(e => e.event)
            expect(ids).toContain('evS')
        })
    })

    // --- Scenario D2: SCHEDULE event WITH data is NOT filtered out ---

    describe('Scenario D2: SCHEDULE event with data values is transferred (invariant)', () => {
        beforeEach(() => setup(
            [makeEvent('evA', { status: 'SCHEDULE', dataValues: [{ dataElement: 'de1', value: '1' }] })],
            ['resolve', 'resolve', 'resolve', 'resolve', 'resolve']
        ))

        it('includes the SCHEDULE+data event in the CREATE payload', async () => {
            await callMerge()
            const [arg] = engine.mutate.mock.calls[0]
            expect(arg.params.importStrategy).toBe('CREATE')
            expect(arg.data.events).toHaveLength(1)
        })

        it('returns 1 (the SCHEDULE+data event counts as transferred)', async () => {
            expect(await callMerge()).toBe(1)
        })
    })

    // --- Scenario E: CREATE fails — no deletes must run ---

    describe('Scenario E: CREATE fails — safety guarantee', () => {
        beforeEach(() => setup(
            [makeEvent('evA')],
            ['reject']
        ))

        it('throws (rejects)', async () => {
            await expect(callMerge()).rejects.toThrow()
        })

        it('error message says no data has been changed', async () => {
            await expect(callMerge()).rejects.toThrow(/no data has been changed/i)
        })

        it('mutate is called exactly once — DELETE never runs', async () => {
            await callMerge().catch(() => {})
            expect(engine.mutate).toHaveBeenCalledTimes(1)
        })
    })

    // --- Scenario F: audit note failure is non-fatal ---

    describe('Scenario F: audit note failure is non-fatal', () => {
        beforeEach(() => setup(
            [makeEvent('evA')],
            ['resolve', 'resolve', 'resolve', 'resolve', 'reject']
        ))

        it('resolves despite the audit note failing', async () => {
            await expect(callMerge()).resolves.not.toThrow()
        })

        it('returns the correct event count even when the note fails', async () => {
            expect(await callMerge()).toBe(1)
        })

        it('attempted all 5 mutate calls including the failed note', async () => {
            await callMerge()
            expect(engine.mutate).toHaveBeenCalledTimes(5)
        })
    })

    // --- Scenario G: audit note payload contains target enrollment details ---

    describe('Scenario G: audit note payload', () => {
        beforeEach(() => setup(
            [makeEvent('evA')],
            ['resolve', 'resolve', 'resolve', 'resolve', 'resolve']
        ))

        it('UPDATE call carries the target enrollment UID', async () => {
            await callMerge()
            const updateCall = engine.mutate.mock.calls.find(
                ([arg]) => arg.params?.importStrategy === 'UPDATE'
            )
            expect(updateCall[0].data.enrollments[0].enrollment).toBe(TARGET_UID)
        })

        it('UPDATE payload includes program, orgUnit, trackedEntity, enrolledAt, status from target', async () => {
            await callMerge()
            const updateCall = engine.mutate.mock.calls.find(
                ([arg]) => arg.params?.importStrategy === 'UPDATE'
            )
            const payload = updateCall[0].data.enrollments[0]
            expect(payload.program).toBe(targetEnrollmentData.program)
            expect(payload.orgUnit).toBe(targetEnrollmentData.orgUnit)
            expect(payload.trackedEntity).toBe(targetEnrollmentData.trackedEntity)
            expect(payload.enrolledAt).toBe(targetEnrollmentData.enrolledAt)
            expect(payload.status).toBe(targetEnrollmentData.status)
        })

        it('audit note text contains the source TEI UID and source identifier', async () => {
            await callMerge()
            const updateCall = engine.mutate.mock.calls.find(
                ([arg]) => arg.params?.importStrategy === 'UPDATE'
            )
            const noteText = updateCall[0].data.enrollments[0].notes[0].value
            expect(noteText).toContain(SOURCE_TEI)
            expect(noteText).toContain('SA0120130805F')
        })
    })
})
