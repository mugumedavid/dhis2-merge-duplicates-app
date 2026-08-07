import React, { useState, useEffect } from 'react'
import { useDataEngine } from '@dhis2/app-runtime'
import {
    Button,
    SingleSelect,
    SingleSelectOption,
    CircularLoader,
    NoticeBox,
    Box,
} from '@dhis2/ui'
import {
    getTrackerPrograms,
    getProgramAttributes,
    getUserRoles,
    saveConfig,
    isSuperuser,
    TEI_ID_OPTION,
} from '../api'

export default function ConfigPanel({ config, onSave, currentUser }) {
    const engine = useDataEngine()
    const canEdit = isSuperuser(currentUser)

    const [programs, setPrograms] = useState([])
    const [attributes, setAttributes] = useState([])
    const [roles, setRoles] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const [programUid, setProgramUid] = useState(config.programUid || '')
    const [attributeUid, setAttributeUid] = useState(config.attributeUid || '')
    const [accessRoleUid, setAccessRoleUid] = useState(config.accessRoleUid || '')

    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const [progs, rols] = await Promise.all([
                    getTrackerPrograms(engine),
                    getUserRoles(engine),
                ])
                setPrograms(progs)
                setRoles(rols)
            } catch (e) {
                setError(e.message)
            }
            setLoading(false)
        }
        load()
    }, [engine])

    useEffect(() => {
        if (!programUid) {
            setAttributes([])
            setAttributeUid('')
            return
        }
        getProgramAttributes(engine, programUid).then(attrs => {
            const all = [TEI_ID_OPTION, ...attrs]
            setAttributes(all)
            // Keep existing selection if still valid, else clear
            if (!all.find(a => a.id === attributeUid)) setAttributeUid('')
        })
    }, [programUid]) // eslint-disable-line react-hooks/exhaustive-deps

    async function handleSave() {
        setSaving(true)
        const attributeLabel = attributes.find(a => a.id === attributeUid)?.displayName || ''
        const next = { programUid, attributeUid, attributeLabel, accessRoleUid }
        try {
            await saveConfig(engine, next)
            onSave(next)
        } catch (e) {
            setError(`Save failed: ${e.message}`)
        }
        setSaving(false)
    }

    if (loading) return <div style={styles.loading}><CircularLoader small /> Loading configuration...</div>

    return (
        <Box padding="16px" border="1px solid #e0e0e0" borderRadius="4px" marginBottom="16px" background="#fafafa">
            <div style={styles.title}>App Settings</div>

            {error && <NoticeBox error title="Error" style={{ marginBottom: 8 }}>{error}</NoticeBox>}

            {!canEdit && (
                <NoticeBox warning style={{ marginBottom: 8 }}>
                    Only superusers can edit app settings. Current configuration is shown below.
                </NoticeBox>
            )}

            <div style={styles.row}>
                <label style={styles.label}>Tracker program</label>
                <SingleSelect
                    selected={programUid}
                    onChange={({ selected }) => setProgramUid(selected)}
                    disabled={!canEdit}
                    placeholder="Select a program..."
                    dense
                >
                    {programs.map(p => (
                        <SingleSelectOption key={p.id} value={p.id} label={p.displayName} />
                    ))}
                </SingleSelect>
            </div>

            <div style={styles.row}>
                <label style={styles.label}>Search attribute (UIC / identifier)</label>
                <SingleSelect
                    selected={attributeUid}
                    onChange={({ selected }) => setAttributeUid(selected)}
                    disabled={!canEdit || !programUid}
                    placeholder={programUid ? 'Select an attribute...' : 'Select a program first'}
                    dense
                >
                    {attributes.map(a => (
                        <SingleSelectOption
                            key={a.id}
                            value={a.id}
                            label={`${a.displayName}${a.unique ? ' (unique)' : a.searchable ? ' (searchable)' : ''}`}
                        />
                    ))}
                </SingleSelect>
            </div>

            <div style={styles.row}>
                <label style={styles.label}>Role required to use this app</label>
                <SingleSelect
                    selected={accessRoleUid}
                    onChange={({ selected }) => setAccessRoleUid(selected)}
                    disabled={!canEdit}
                    placeholder="Superusers only (default)"
                    dense
                >
                    {roles.map(r => (
                        <SingleSelectOption key={r.id} value={r.id} label={r.displayName} />
                    ))}
                </SingleSelect>
                <div style={styles.hint}>Superusers always have access regardless of this setting.</div>
            </div>

            {canEdit && (
                <Button
                    primary
                    small
                    onClick={handleSave}
                    disabled={!programUid || !attributeUid || saving}
                    style={{ marginTop: 4 }}
                >
                    {saving ? <CircularLoader small /> : 'Save settings'}
                </Button>
            )}
        </Box>
    )
}

const styles = {
    title: {
        fontWeight: 'bold',
        fontSize: 13,
        marginBottom: 12,
        color: '#333',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    row: {
        marginBottom: 12,
    },
    label: {
        display: 'block',
        fontSize: 12,
        color: '#555',
        marginBottom: 4,
    },
    hint: {
        fontSize: 11,
        color: '#888',
        marginTop: 3,
    },
    loading: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        color: '#555',
        fontSize: 13,
    },
}
