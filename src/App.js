import React, { useRef, useState } from 'react'
import { useDataQuery, useDataEngine } from '@dhis2/app-runtime'
import {
    CircularLoader,
    NoticeBox,
    AlertBar,
    AlertStack,
    Button,
} from '@dhis2/ui'
import ConfigPanel from './components/ConfigPanel'
import EnrollmentPanel from './components/EnrollmentPanel'
import { userHasAccess, loadConfig, mergeEnrollments } from './api'

const currentUserQuery = {
    me: {
        resource: 'me',
        params: { fields: 'id,displayName,userRoles[id,name],authorities' },
    },
}

export default function App() {
    const { loading, error, data } = useDataQuery(currentUserQuery)
    const engine = useDataEngine()

    const leftRef = useRef(null)
    const rightRef = useRef(null)
    const [leftData, setLeftData] = useState(null)
    const [rightData, setRightData] = useState(null)
    const [merging, setMerging] = useState(false)
    const [alerts, setAlerts] = useState([])
    const [config, setConfig] = useState(null)         // null = not yet loaded
    const [configLoaded, setConfigLoaded] = useState(false)
    const [showConfig, setShowConfig] = useState(false)

    // Load config from dataStore once the current user is available
    React.useEffect(() => {
        if (!data?.me) return
        loadConfig(engine).then(cfg => {
            setConfig(cfg || {})
            setConfigLoaded(true)
            // Show settings panel if not yet configured
            if (!cfg?.programUid || !cfg?.attributeUid) setShowConfig(true)
        })
    }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

    function addAlert(message, success = true) {
        const id = Date.now()
        setAlerts(prev => [...prev, { id, message, success }])
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 6000)
    }

    async function handleMerge(keepSide) {
        const target = keepSide === 'left' ? leftData : rightData
        const source = keepSide === 'left' ? rightData : leftData
        if (!target || !source) return

        const sourceSideLabel = keepSide === 'left' ? 'right' : 'left'
        const confirmed = window.confirm(
            `This will move all events from the ${sourceSideLabel} record into the ${keepSide} record, ` +
            `then permanently delete the ${sourceSideLabel} enrollment and TEI.\n\nThis cannot be undone. Proceed?`
        )
        if (!confirmed) return

        setMerging(true)
        try {
            await mergeEnrollments(engine, target.enrollmentUid, source.enrollmentUid, source.teiUid)
            addAlert('Merge complete. The duplicate record has been deleted.')
            if (keepSide === 'left') {
                setRightData(null)
                rightRef.current?.reset()
            } else {
                setLeftData(null)
                leftRef.current?.reset()
            }
        } catch (e) {
            addAlert(`Merge failed: ${e.message || 'Unknown error'}`, false)
        }
        setMerging(false)
    }

    if (loading || !configLoaded) {
        return <div style={styles.center}><CircularLoader /></div>
    }

    if (error) {
        return <NoticeBox error title="Could not load user">{error.message}</NoticeBox>
    }

    const currentUser = data.me
    const hasAccess = userHasAccess(currentUser, config?.accessRoleUid)

    if (!hasAccess) {
        return (
            <div style={styles.center}>
                <NoticeBox warning title="Access denied">
                    Your account does not have permission to use this app. Contact your system administrator.
                </NoticeBox>
            </div>
        )
    }

    const isConfigured = config?.programUid && config?.attributeUid

    return (
        <div style={styles.wrapper}>
            <div style={styles.header}>
                <h2 style={styles.title}>Merge Duplicate Records</h2>
                <Button small onClick={() => setShowConfig(v => !v)}>
                    {showConfig ? 'Hide settings' : 'Settings'}
                </Button>
            </div>

            {showConfig && (
                <ConfigPanel
                    config={config}
                    currentUser={currentUser}
                    onSave={cfg => {
                        setConfig(cfg)
                        setShowConfig(false)
                        // Reset panels when config changes
                        setLeftData(null)
                        setRightData(null)
                        leftRef.current?.reset()
                        rightRef.current?.reset()
                    }}
                />
            )}

            {!isConfigured ? (
                <NoticeBox title="Not configured" style={{ marginTop: 16 }}>
                    A superuser must select a program and search attribute in Settings before the app can be used.
                </NoticeBox>
            ) : (
                <>
                    <p style={styles.subtitle}>
                        Search for two records to compare their enrollments. Rows highlighted in yellow differ between the two.
                        Click <em>Merge into this</em> to keep that record and move all events from the other into it.
                    </p>
                    <div style={styles.panels}>
                        <EnrollmentPanel
                            ref={leftRef}
                            side="left"
                            config={config}
                            otherPanel={{ data: rightData }}
                            onMerge={handleMerge}
                            merging={merging}
                            onDataChange={setLeftData}
                        />
                        <div style={styles.divider} />
                        <EnrollmentPanel
                            ref={rightRef}
                            side="right"
                            config={config}
                            otherPanel={{ data: leftData }}
                            onMerge={handleMerge}
                            merging={merging}
                            onDataChange={setRightData}
                        />
                    </div>
                </>
            )}

            <AlertStack>
                {alerts.map(a => (
                    <AlertBar
                        key={a.id}
                        success={a.success}
                        critical={!a.success}
                        onHidden={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                    >
                        {a.message}
                    </AlertBar>
                ))}
            </AlertStack>
        </div>
    )
}

const styles = {
    wrapper: {
        padding: '24px 32px',
        maxWidth: 1200,
        margin: '0 auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        margin: 0,
        fontSize: 22,
    },
    subtitle: {
        color: '#555',
        marginBottom: 20,
        fontSize: 14,
    },
    panels: {
        display: 'flex',
        gap: 0,
        alignItems: 'flex-start',
    },
    divider: {
        width: 1,
        background: '#ddd',
        alignSelf: 'stretch',
        margin: '0 16px',
    },
    center: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '60vh',
        padding: 32,
    },
}
