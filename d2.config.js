const config = {
    type: 'app',
    title: 'Merge Duplicate Tracker Records',
    description: 'Identify and merge duplicate tracker enrollments across any DHIS2 tracker program.',
    icon: './src/icon.svg',
    minDHIS2Version: '2.40',
    entryPoints: {
        app: './src/App.jsx',
    },
}

module.exports = config
