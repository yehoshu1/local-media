const { addonBuilder } = require('stremio-addon-sdk')
const fs = require('fs').promises
const path = require('path')

const LOCAL_FILES_DIR = '/home/Library/Movies And Series'

const manifest = {
    id: 'org.youraddonname.localfiles',
    version: '1.0.0',
    name: 'Local Files With Catalog Support',
    description: 'Stremio addon for local files With Catalog Support',
    types: ['movie', 'series'],
    catalogs: [
        { type: 'movie', id: 'local-movies' },
        { type: 'series', id: 'local-series' }
    ],
    resources: ['catalog', 'stream'],
    idPrefixes: ['local-movie', 'local-series']
}

const builder = new addonBuilder(manifest)
let localFiles = null

async function scanLocalFiles() {
    console.log('Scanning local files...')
    const movies = []
    const series = {}

    // Scan Movies
    const moviesDir = path.join(LOCAL_FILES_DIR, 'Movies')
    const movieEntries = await fs.readdir(moviesDir, { withFileTypes: true })
    for (const entry of movieEntries) {
        if (entry.isFile() && isVideoFile(entry.name)) {
            const fullPath = path.join(moviesDir, entry.name)
            movies.push({ name: path.parse(entry.name).name, path: fullPath })
        }
    }

    // Scan Series
    const seriesDir = path.join(LOCAL_FILES_DIR, 'Series')
    const seriesEntries = await fs.readdir(seriesDir, { withFileTypes: true })
    for (const seriesEntry of seriesEntries) {
        if (seriesEntry.isDirectory()) {
            const seriesName = seriesEntry.name
            series[seriesName] = []
            const seasonDir = path.join(seriesDir, seriesName)
            const seasonEntries = await fs.readdir(seasonDir, { withFileTypes: true })
            for (const seasonEntry of seasonEntries) {
                if (seasonEntry.isDirectory()) {
                    const episodeDir = path.join(seasonDir, seasonEntry.name)
                    const episodeEntries = await fs.readdir(episodeDir, { withFileTypes: true })
                    for (const episodeEntry of episodeEntries) {
                        if (episodeEntry.isFile() && isVideoFile(episodeEntry.name)) {
                            const fullPath = path.join(episodeDir, episodeEntry.name)
                            series[seriesName].push({ name: path.parse(episodeEntry.name).name, path: fullPath })
                        }
                    }
                }
            }
        }
    }

    console.log(`Scan complete. Found ${movies.length} movies and ${Object.keys(series).length} TV series.`)
    return { movies, series }
}

function isVideoFile(filename) {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv']
    return videoExtensions.includes(path.extname(filename).toLowerCase())
}

builder.defineCatalogHandler(async ({type, id}) => {
    if (!localFiles) {
        localFiles = await scanLocalFiles()
    }
    if (type === 'movie' && id === 'local-movies') {
        return {
            metas: localFiles.movies.map(movie => ({
                id: 'local-movie:' + encodeURIComponent(movie.path),
                type: 'movie',
                name: movie.name,
            }))
        }
    } else if (type === 'series' && id === 'local-series') {
        return {
            metas: Object.keys(localFiles.series).map(seriesName => ({
                id: 'local-series:' + encodeURIComponent(seriesName),
                type: 'series',
                name: seriesName,
            }))
        }
    } else {
        return { metas: [] }
    }
})

builder.defineStreamHandler(async ({ type, id }) => {
    if (!localFiles) {
        localFiles = await scanLocalFiles()
    }
    const [contentType, path] = id.split(':')
    const decodedPath = decodeURIComponent(path)
    if (contentType === 'local-movie') {
        const movie = localFiles.movies.find(m => m.path === decodedPath)
        if (movie) {
            return {
                streams: [{
                    title: 'Local file',
                    url: `file://${movie.path}`,
                    type: 'file',
                }]
            }
        }
    } else if (contentType === 'local-series') {
        const seriesEpisodes = localFiles.series[decodedPath] || []
        return {
            streams: seriesEpisodes.map(episode => ({
                title: episode.name,
                url: `file://${episode.path}`,
                type: 'file',
            }))
        }
    }
    return { streams: [] }
})

const addon = builder.getInterface()

const { serveHTTP } = require('stremio-addon-sdk')
serveHTTP(addon, { port: 7000 }).then(({ url }) => {
    console.log('Addon running at:', url)
    console.log('To install in Stremio, use:', url + 'manifest.json')
}).catch(error => {
    console.error('Failed to start addon server:', error)
})