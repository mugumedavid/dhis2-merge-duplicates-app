import React, { useState, forwardRef, useImperativeHandle } from 'react'
import { useDataEngine } from '@dhis2/app-runtime'
import {
    Button,
    Input,
    CircularLoader,
    NoticeBox,
    Tag,
} from '@dhis2/ui'
import { searchByAttribute, getEnrollment, getEnrollmentEvents, getProgramStages, TEI_ID_SENTINEL } from '../api'

function TEARow({ label, value, otherValue }) {
    const different = value !== undefined && value !== null && value !== '' && value !== otherValue
    return (
        <tr style={{ background: different ? '#fff3cd' : 'transparent' }}>
            <td style={styles.teaLabel}>{label}</td>
            <td style={{ ...styles.teaValue, fontWeight: different ? 'bold' : 'normal' }}>
                {value || <span style={{ color: '#aaa' }}>(empty)</span>}
            </td>
        </tr>
    )
}

function StageRow({ name, count }) {
    return (
        <tr>
            <td style={styles.teaLabel}>{name}</td>
            <td style={styles.teaValue}>
                <Tag>{count} event{count !== 1 ? 's' : ''}</Tag>
            </td>
        </tr>
    )
}

const EnrollmentPanel = forwardRef(function EnrollmentPanel(
    { side, config, otherPanel, onMerge, merging, mergeBlocked, onDataChange },
    ref
) {
    const engine = useDataEngine()
    const [searchValue, setSearchValue] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [data, setData] = useState(null)

    useImperativeHandle(ref, () => ({
        reset() {
            setSearchValue('')
            setData(null)
            setError(null)
            onDataChange?.(null)
        },
    }))

    async function handleSearch() {
        const isTeiSearch = config.attributeUid === TEI_ID_SENTINEL
        const val = isTeiSearch ? searchValue.trim() : searchValue.trim().toUpperCase()
        if (!val) return
        setLoading(true)
        setError(null)
        setData(null)
        onDataChange?.(null)

        try {
            const teis = await searchByAttribute(engine, config.programUid, config.attributeUid, val)

            if (teis.length === 0) {
                setError('No records found.')
                setLoading(false)
                return
            }
            if (teis.length > 1) {
                setError(`${teis.length} records found — refine the search value.`)
                setLoading(false)
                return
            }

            const tei = teis[0]
            const enrollment = await getEnrollment(engine, tei.trackedEntity, config.programUid)
            if (!enrollment) {
                setError('TEI found but has no enrollment in this program.')
                setLoading(false)
                return
            }

            const [events, stages] = await Promise.all([
                getEnrollmentEvents(engine, enrollment.enrollment, config.programUid, tei.trackedEntity),
                getProgramStages(engine, config.programUid),
            ])

            // Count only real events (exclude SCHEDULE — those are empty auto-created placeholders)
            const stageCounts = {}
            for (const ev of events) {
                if (ev.status === 'SCHEDULE') continue
                stageCounts[ev.programStage] = (stageCounts[ev.programStage] || 0) + 1
            }

            // Build stage display rows (show all stages, 0 if no events)
            const stageRows = stages.map(s => ({
                uid: s.id,
                name: s.displayName,
                count: stageCounts[s.id] || 0,
            }))

            const resolved = {
                teiUid: tei.trackedEntity,
                enrollmentUid: enrollment.enrollment,
                orgUnitName: enrollment.orgUnitName,
                enrolledAt: enrollment.enrolledAt,
                attributes: tei.attributes || [],
                stageRows,
            }
            setData(resolved)
            onDataChange?.(resolved)
        } catch (e) {
            setError(e.message || 'Search failed.')
        }
        setLoading(false)
    }

    const canMerge = data && otherPanel?.data && !merging && !mergeBlocked
    const otherAttrs = {}
    for (const a of (otherPanel?.data?.attributes || [])) {
        otherAttrs[a.attribute] = a.value
    }

    const attributeLabel = config.attributeLabel || 'Search value'

    return (
        <div style={styles.panel}>
            <div style={styles.searchRow}>
                <Input
                    value={searchValue}
                    onChange={({ value }) => setSearchValue(value)}
                    placeholder={`Enter ${attributeLabel}...`}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    disabled={merging}
                    dense
                />
                <Button onClick={handleSearch} disabled={loading || merging} small>
                    {loading ? <CircularLoader small /> : 'Search'}
                </Button>
            </div>

            {canMerge && (
                <Button
                    primary
                    onClick={() => onMerge(side)}
                    disabled={merging}
                    style={styles.mergeButton}
                >
                    {merging ? <CircularLoader small /> : 'Merge into this'}
                </Button>
            )}

            {error && (
                <NoticeBox error title="Not found" style={{ marginTop: 8 }}>
                    {error}
                </NoticeBox>
            )}

            {data && (
                <>
                    <div style={styles.meta}>
                        <strong>TEI:</strong> {data.teiUid}<br />
                        <strong>Enrolling org unit:</strong> {data.orgUnitName}<br />
                        <strong>Enrolled:</strong> {data.enrolledAt?.slice(0, 10)}
                    </div>

                    <div style={styles.sectionHeader}>Attributes</div>
                    <table style={styles.table}>
                        <tbody>
                            {data.attributes.map(attr => (
                                <TEARow
                                    key={attr.attribute}
                                    label={attr.displayName || attr.attribute}
                                    value={attr.value}
                                    otherValue={otherAttrs[attr.attribute]}
                                />
                            ))}
                        </tbody>
                    </table>

                    <div style={styles.sectionHeader}>Program Stages</div>
                    <table style={styles.table}>
                        <tbody>
                            {data.stageRows.map(s => (
                                <StageRow key={s.uid} name={s.name} count={s.count} />
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    )
})

export default EnrollmentPanel

const styles = {
    panel: {
        flex: 1,
        padding: 16,
        border: '1px solid #e0e0e0',
        borderRadius: 4,
        minWidth: 0,
    },
    searchRow: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        marginBottom: 8,
    },
    mergeButton: {
        marginBottom: 12,
        width: '100%',
    },
    meta: {
        fontSize: 12,
        color: '#555',
        marginBottom: 8,
        lineHeight: 1.6,
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: 8,
        fontSize: 13,
    },
    teaLabel: {
        padding: '4px 8px',
        color: '#666',
        width: '45%',
        verticalAlign: 'top',
        borderBottom: '1px solid #f0f0f0',
    },
    teaValue: {
        padding: '4px 8px',
        borderBottom: '1px solid #f0f0f0',
    },
    sectionHeader: {
        fontWeight: 'bold',
        fontSize: 11,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginTop: 12,
        marginBottom: 4,
    },
}
