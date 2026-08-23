const SUPABASE_URL = 'https://vkafuvslrpwfevkfzxyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrYWZ1dnNscnB3ZmV2a2Z6eHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzkzOTAsImV4cCI6MjEwMjQxNTM5MH0.jTKSLHb5RaYbXlBEQgWpEntfzzvIBI6esSdNzm58nek';
const R2_WORKER_URL = 'https://repertorios-r2-api.kevinf652.workers.dev';

// Helper: Extract a clean R2 key from any URL or path string
function extractR2Key(urlOrPath) {
    if (!urlOrPath) return '';
    try {
        let key = urlOrPath;
        if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
            key = new URL(urlOrPath).pathname;
        }
        if (key.startsWith('/')) key = key.substring(1);
        if (key.toLowerCase().startsWith('file/')) key = key.substring(5);
        return key;
    } catch (e) {
        let key = urlOrPath;
        if (key.startsWith('/')) key = key.substring(1);
        if (key.toLowerCase().startsWith('file/')) key = key.substring(5);
        return key;
    }
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_MAP = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11, 'B#': 0
};
const KEY_NAMES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
const KEY_VALUES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9) }
let useFlats = load('cb_use_flats', false);

function dn(note) { if (!note) return ''; const idx = NOTE_MAP[note]; if (idx === undefined) return note; return useFlats ? FLATS[idx] : SHARPS[idx] }
function nn(n) { return NOTE_MAP[n] !== undefined ? dn(n) : n }
function displayNote(n) { return dn(n) }
function displayChord(c) { return c.replace(/([A-G][#b]?)/g, (match) => { const idx = NOTE_MAP[match]; if (idx === undefined) return match; return useFlats ? FLATS[idx] : SHARPS[idx] }) }
function toggleNotation() { useFlats = !useFlats; save('cb_use_flats', useFlats); const btns = document.querySelectorAll('#notation-toggle,#lib-notation-toggle'); btns.forEach(b => b.innerHTML = useFlats ? '♭' : '#'); if (viewingRepId) { const r = repertorios.find(x => x.id === viewingRepId); const s = r?.canciones.find(x => x.id === viewingRepSongId); if (s) { repCurrentKey = dn(s.tono_original) } } if (viewingSongId) { const s = songs.find(x => x.id === viewingSongId); if (s && NOTE_MAP[s.currentKey] !== undefined) { s.currentKey = dn(s.currentKey); save('cb_songs', songs) } } if (viewingRepId) renderRepSongLyrics(); if (viewingSongId) renderView(); renderLibrary() }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

// Parse filename: "Nombre - Artista - Tono - BPM" or simpler formats
function parseSongFilename(name) {
    const base = name.replace(/\.[^/.]+$/, '').replace(/[_]/g, ' ').trim();
    const KEY_RE = /^([A-Ga-g][#b]?m?m?[a-z0-9]*)$/;
    const BPM_RE = /^\d{2,3}$/;
    const parts = base.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 4) {
        const bpm = parts[parts.length - 1];
        const key = parts[parts.length - 2];
        if (BPM_RE.test(bpm) && KEY_RE.test(key)) {
            return { title: parts.slice(0, parts.length - 2).join(' - '), artist: parts[parts.length - 3] || 'Desconocido', key: key.toUpperCase(), bpm: parseInt(bpm) };
        }
    }
    if (parts.length >= 3) {
        const key = parts[parts.length - 1];
        if (KEY_RE.test(key)) {
            return { title: parts.slice(0, parts.length - 1).join(' - '), artist: parts[parts.length - 2] || 'Desconocido', key: key.toUpperCase(), bpm: 0 };
        }
    }
    if (parts.length >= 2) {
        return { title: parts[0], artist: parts[1], key: '', bpm: 0 };
    }
    return { title: base || 'Sin título', artist: 'Desconocido', key: '', bpm: 0 };
}

// Parse coros from DB - handles JSON object {d:[],l:[]}, array, comma-separated string, or null
function parseCoros(c, day) {
    if (!c) return [];
    if (typeof c === 'string') {
        try { c = JSON.parse(c) } catch (e) { return c.split(',').map(function(x) { return x.trim() }).filter(Boolean) }
    }
    if (typeof c === 'object' && !Array.isArray(c)) {
        return c[day === 'domingo' ? 'd' : 'l'] || c.d || c.l || [];
    }
    if (Array.isArray(c)) return c;
    return [];
}

let songs = load('cb_songs', []);
let lists = load('cb_lists', []);
let repertorios = [];
let repAdmin = false;
let userRole = 'usuario';
let viewingRepId = null;
let viewingRepSongId = null;
let repDay = 'domingo';
let libVocalMode = null;
let repShowChords = true;
let repCurrentKey = '';
let repTab = 'active';
let repHistoryMonth = '';
let repHistoryYear = '';
let editingSongId = null;
let viewingSongId = null;
let viewingListId = null;
let viewReturnTo = null;
let formTags = [];
let formKey = 'C';
let listNavIndex = 0;
let repSongNavIndex = 0;
let supabaseReady = false;
let supabaseClient = null;
let currentUser = null;
let syncInProgress = false;
let pendingSync = false;
let addSongDefaultDia = 'ambos';
let addSongDirectMode = false;
let vocalEditorRepId = null;
let vocalEditorSongId = null;
let vocalEditorMode = 'add';
let vocalEditorContextDay = 'domingo';
let vocalEditorDay = 'ambos';
let vocalNotesCache = {};
let vocalNotesTimers = {};
let cloudSongPreviewCache = {};
let audioUploadSongId = null;
let viewAudioEl = null;
let viewAudioPlaying = false;
let viewAudioInterval = null;
let repAudioEl = null;
let repAudioPlaying = false;
let repAudioInterval = null;
let vocalAudioPlayers = {};
let vocalAudioCurrentKey = null;
let vocalAudioInterval = null;
let vocalAudioUploadCoro = null;
let vocalAudioUploadRepId = null;
let vocalAudioUploadSongId = null;
let vocalAudioUploadSourceSongId = null;
let vocalAudioUploadDia = 'domingo';

// ============= AUTH SYSTEM =============
function isAdmin() { return userRole === 'admin' }
function isDMusicos() { return userRole === 'D_Musicos' }
function isDVoces() { return userRole === 'D_Voces' }
function canEditRepSongs() { return isAdmin() || isDMusicos() }
function canEditVocals() { return isAdmin() || isDVoces() }
function canUploadAudio() { return isAdmin() }
function canManageReps() { return isAdmin() }

function isSongInAnyRepertorio(songId) {
    if (!songId || !Array.isArray(repertorios)) return false;
    return repertorios.some(r => r.canciones && r.canciones.some(c => c.source_song_id === songId));
}

async function isSongAudioNeededElsewhere(songId) {
    if (!songId) return true;
    if (isSongInAnyRepertorio(songId)) return true;
    if (!supabaseReady) return true;
    try {
        const myId = currentUser ? currentUser.id : null;
        const { data: matches, error } = await supabaseClient.from('user_songs').select('user_id,song_data').limit(10000);
        if (error || !matches) return true;
        return matches.some(m => {
            if (myId && m.user_id === myId) return false;
            try {
                const sd = typeof m.song_data === 'string' ? JSON.parse(m.song_data) : m.song_data;
                return sd && sd.id === songId;
            } catch (e) { return false }
        });
    } catch (e) { console.error('isSongAudioNeededElsewhere error:', e); return true }
}

// ============= NOTIFICATION SYSTEM =============
function showNotification(message, type) {
    const existing = document.querySelector('.floating-notification');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'floating-notification';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 12px;
        font-size: .85rem;
        font-weight: 500;
        z-index: 9999;
        animation: slideDown .3s ease;
        box-shadow: 0 10px 25px rgba(0,0,0,.3);
    `;

    if (type === 'success') {
        div.style.background = 'rgba(34,197,94,.9)';
        div.style.color = '#fff';
    } else {
        div.style.background = 'rgba(248,113,113,.9)';
        div.style.color = '#fff';
    }

    div.textContent = message;
    document.body.appendChild(div);

    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity .3s';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

function showNotif(id, msg, type) {
    const n = document.getElementById(id);
    n.innerHTML = '<div class="notification notification-' + type + '">' + (type === 'success' ? '✓' : '✕') + ' ' + msg + '</div>';
    setTimeout(() => { n.innerHTML = '' }, 3000);
}

// ============= IMPORT CONFIRM MODAL =============
function showImportConfirmModal(newSongs, listData, fileSongs) {
    const modal = document.createElement('div');
    modal.id = 'import-confirm-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.75);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn .25s ease;
    `;

    const existingCount = fileSongs.length - newSongs.length;

    modal.innerHTML = `
        <div style="
            background: #27272a;
            border-radius: 16px;
            max-width: 500px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,.5);
            border: 1px solid rgba(63,63,70,.3);
        ">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="
                    width:44px;
                    height:44px;
                    background:rgba(245,158,11,.15);
                    border-radius:12px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:24px
                ">📥</div>
                <div>
                    <h3 style="font-size:1rem;font-weight:700;color:#fff">Importar lista</h3>
                    <p style="font-size:.8rem;color:#a1a1aa">${esc(listData.name || 'Lista importada')}</p>
                </div>
            </div>
            
            <div style="
                background:rgba(39,39,42,.4);
                border:1px solid rgba(63,63,70,.3);
                border-radius:10px;
                padding:14px;
                margin-bottom:16px
            ">
                <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#a1a1aa">
                    <span>Total de canciones</span>
                    <span style="color:#fff;font-weight:600">${fileSongs.length}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#a1a1aa;margin-top:4px">
                    <span>Ya en tu biblioteca</span>
                    <span style="color:#4ade80;font-weight:600">${existingCount}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:.8rem;color:#a1a1aa;margin-top:4px">
                    <span>Nuevas canciones</span>
                    <span style="color:#fbbf24;font-weight:600">${newSongs.length}</span>
                </div>
            </div>
            
            ${newSongs.length > 0 ? `
                <div style="
                    background:rgba(245,158,11,.08);
                    border:1px solid rgba(245,158,11,.2);
                    border-radius:8px;
                    padding:12px;
                    margin-bottom:16px;
                    max-height:150px;
                    overflow-y:auto
                ">
                    <p style="font-size:.7rem;color:#fbbf24;font-weight:600;margin-bottom:6px">📋 Canciones nuevas:</p>
                    ${newSongs.slice(0,5).map(s => `
                        <div style="font-size:.75rem;color:#d4d4d8;padding:2px 0">
                            • ${esc(s.title || 'Sin título')} — ${esc(s.artist || 'Desconocido')}
                        </div>
                    `).join('')}
                    ${newSongs.length > 5 ? `<div style="font-size:.7rem;color:#71717a;margin-top:4px">Y ${newSongs.length - 5} más...</div>` : ''}
                </div>
                
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                    <button class="btn btn-amber" onclick="confirmImportAll('${listData.id || 'new'}')" style="width:100%;padding:12px;font-weight:600">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:6px">
                            <polyline points="20,6 9,17 4,12"/>
                        </svg>
                        Añadir todas (${newSongs.length})
                    </button>
                    <button class="btn btn-zinc" onclick="confirmImportLater()" style="width:100%;padding:12px;font-weight:600;background:rgba(39,39,46,.8);border:1px solid rgba(63,63,70,.5)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:6px">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12,6 12,12 16,14"/>
                        </svg>
                        Elegir después (una por una)
                    </button>
                </div>
            ` : `
                <div style="
                    background:rgba(34,197,94,.08);
                    border:1px solid rgba(34,197,94,.2);
                    border-radius:8px;
                    padding:12px;
                    margin-bottom:16px;
                    text-align:center
                ">
                    <p style="font-size:.85rem;color:#4ade80">✅ ¡Todas las canciones ya están en tu biblioteca!</p>
                    <p style="font-size:.7rem;color:#71717a">La lista se creará sin duplicados</p>
                </div>
                <button class="btn btn-amber" onclick="confirmImportAll('${listData.id || 'new'}')" style="width:100%;padding:12px;font-weight:600">
                    Crear lista
                </button>
            `}
            
            <button onclick="closeImportConfirmModal()" style="
                width:100%;
                padding:10px;
                background:transparent;
                border:1px solid rgba(63,63,70,.3);
                border-radius:8px;
                color:#71717a;
                font-size:.8rem;
                cursor:pointer;
                margin-top:8px;
                transition:background .2s
            " onmouseover="this.style.background='rgba(63,63,70,.1)'" onmouseout="this.style.background='transparent'">
                Cancelar
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    window._importPendingList = {
        listData: listData,
        newSongs: newSongs,
        fileSongs: fileSongs
    };
}

function closeImportConfirmModal() {
    const modal = document.getElementById('import-confirm-modal');
    if (modal) modal.remove();
    window._importPendingList = null;
}

function confirmImportAll(listId) {
    const pending = window._importPendingList;
    if (!pending) return;

    // Add ALL new songs to library
    pending.newSongs.forEach(s => {
        const songId = s.id || genId();
        const existing = songs.find(x => x.id === songId);
        if (!existing) {
            const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
            songs.push({
                id: songId,
                sourceId: s.id || null,
                sourceType: s.id ? 'imported' : undefined,
                title: s.title || 'Sin título',
                artist: s.artist || 'Desconocido',
                lyrics: s.lyrics || '',
                originalKey: dk,
                currentKey: dk,
                tempo: s.tempo || 0,
                compas: s.compas || '',
                tags: s.tags || [],
                audio_url: s.audio_url || null,
                createdAt: s.createdAt || Date.now(),
                updatedAt: Date.now(),
                createdBy: s.createdBy || ''
            });
        }
    });

    save('cb_songs', songs);

    // Create or merge list
    createOrMergeList(pending.listData, pending.fileSongs);

    if (currentUser && supabaseReady) {
        syncSongsToCloud();
    }

    closeImportConfirmModal();
    renderLists();
    showNotification(`✅ ${pending.newSongs.length} canciones añadidas a tu biblioteca`, 'success');
}

function confirmImportLater() {
    const pending = window._importPendingList;
    if (!pending) return;

    createOrMergeList(pending.listData, pending.fileSongs, true);

    closeImportConfirmModal();
    renderLists();
    showNotification('📋 Lista importada. Puedes añadir canciones desde la lista.', 'success');
}

// Ventana de solo lectura para ver el contenido real de una canción que aún NO
// está en tu biblioteca (viene de una lista importada en modo "guardar después").
// No permite editar nada — solo ver, y opcionalmente añadir desde aquí mismo.
function showCloudSongPreviewModal(songId) {
    const preview = cloudSongPreviewCache[songId];
    if (!preview) { alert('Aún no se pudo obtener el contenido de esta canción.'); return }
    const old = document.getElementById('cloud-preview-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'cloud-preview-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    modal.innerHTML = '<div style="background:#18181b;border-radius:16px 16px 0 0;max-height:85vh;width:100%;max-width:560px;overflow-y:auto;padding:18px 18px 20px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:10px">'
        + '<div style="min-width:0"><div style="font-size:1.05rem;font-weight:700;color:#fff">' + esc(preview.title || 'Sin título') + '</div>'
        + '<div style="font-size:.8rem;color:#a1a1aa">' + esc(preview.artist || 'Desconocido') + (preview.createdBy ? ' · Creado por ' + esc(preview.createdBy) : '') + '</div></div>'
        + '<button onclick="document.getElementById(\'cloud-preview-modal\').remove()" style="background:none;border:none;color:#a1a1aa;font-size:1.4rem;line-height:1;padding:4px;flex-shrink:0">×</button></div>'
        + '<div style="font-size:.65rem;color:#71717a;margin:6px 0 12px">👁 Vista previa — esta canción aún no está en tu biblioteca</div>'
        + '<pre style="white-space:pre-wrap;font-family:inherit;font-size:.85rem;color:#e4e4e7;line-height:1.6;margin:0 0 18px">' + esc(preview.lyrics || '(Sin letra)') + '</pre>'
        + '<button class="btn btn-amber" style="width:100%" onclick="addCloudSongToLibraryFromList(\'\',\'' + songId + '\');document.getElementById(\'cloud-preview-modal\').remove()">Añadir a mi biblioteca</button>'
        + '</div>';
    document.body.appendChild(modal);
}

function createOrMergeList(listData, fileSongs, pendingOnly = false) {
    const allSongIds = fileSongs.map(s => s.id || genId());
    const existingList = lists.find(l => l.name === listData.name);

    // Aunque se elija "guardar después", ya tenemos los datos reales de cada
    // canción en el JSON importado (título, letra, tono, createdBy...). No hace
    // falta descartarlos y esperar a una búsqueda en la nube que podría no
    // encontrar nada (por ejemplo si el creador original nunca sincronizó esa
    // canción). Se precarga la vista previa directamente con esos datos.
    if (pendingOnly) {
        fileSongs.forEach((s, i) => {
            const sid = allSongIds[i];
            if (cloudSongPreviewCache[sid] === undefined) cloudSongPreviewCache[sid] = s;
        });
    }

    if (existingList) {
        const newIds = allSongIds.filter(id => !existingList.songIds.includes(id));
        existingList.songIds = [...existingList.songIds, ...newIds];
        existingList.updatedAt = Date.now();
        if (newIds.length > 0) {
            showNotification(`📋 Lista "${listData.name}" actualizada (+${newIds.length} canciones)`, 'success');
        }
    } else {
        lists.unshift({
            id: genId(),
            name: listData.name || 'Lista importada',
            description: listData.description || '',
            songIds: allSongIds,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pendingImport: pendingOnly ? true : false
        });
        showNotification(`📋 Lista "${listData.name}" creada (${allSongIds.length} canciones)`, 'success');
    }

    save('cb_lists', lists);
}

// ============= FUNCIONES DE TRANSPOSICIÓN Y UTILIDADES =============
function transposeChord(chord, semitones) {
    return chord.replace(/([A-G][#b]?)/g, (match) => {
        const idx = NOTE_MAP[match];
        if (idx === undefined) return match;
        const newIdx = (idx + semitones + 1200) % 12;
        return useFlats ? FLATS[newIdx] : SHARPS[newIdx];
    });
}

function transposeLine(line, semitones) {
    return line.replace(/\[([^\]]+)\]/g, (_, chord) => '[' + transposeChord(chord, semitones) + ']');
}

function getS(fromKey, toKey) {
    const fi = NOTE_MAP[fromKey];
    const ti = NOTE_MAP[toKey];
    if (fi === undefined || ti === undefined) return 0;
    return (ti - fi + 12) % 12;
}

function detectKey(ly) {
    const c = {};
    let m;
    const r = /\[([^\]]+)\]/g;
    while ((m = r.exec(ly)) !== null) {
        const rm = m[1].match(/^([A-G][#b]?)/);
        if (rm) {
            const k = rm[1];
            c[k] = (c[k] || 0) + 1;
        }
    }
    let mx = 0,
        dk = 'C';
    for (const [k, v] of Object.entries(c)) {
        if (v > mx) { mx = v;
            dk = k }
    }
    return dk;
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function normalizeVocalAudioUrl(url) {
    if (!url) return url;
    const supabasePattern = /^(https?:\/\/[^\/]+\/storage\/v1\/object\/public\/)([^\/]+)\/(.+)$/;
    const match = url.match(supabasePattern);
    if (match) {
        const base = match[1],
            bucket = match[2],
            path = match[3];
        if (path.startsWith(bucket + '/')) {
            return base + bucket + '/' + path.substring(bucket.length + 1);
        }
        return url;
    }
    return url;
}

// ============= SUPABASE INIT =============
try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseReady = true;
        console.log('Supabase connected');
    }
} catch (e) { console.error('Supabase init error:', e) }

// ============= CLOUD SYNC FUNCTIONS =============
function updateSyncStatus(status) {
    const indicator = document.getElementById('sync-indicator');
    if (!indicator) return;
    switch (status) {
        case 'syncing':
        case 'loading':
            indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
            indicator.title = status === 'syncing' ? 'Sincronizando...' : 'Cargando desde la nube...';
            break;
        case 'synced':
            indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>';
            indicator.title = 'Sincronizado con la nube';
            break;
        case 'error':
            indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
            indicator.title = 'Error de sincronización';
            break;
        default:
            indicator.innerHTML = '';
    }
}

async function syncSongsToCloud() {
    if (!currentUser || !supabaseReady) return;
    if (syncInProgress) { pendingSync = true; return }
    syncInProgress = true;
    updateSyncStatus('syncing');
    try {
        const localSongs = load('cb_songs', []);
        try {
            await supabaseClient.from('user_songs').delete().eq('user_id', currentUser.id);
        } catch (delErr) {
            if (delErr.message && delErr.message.includes('row-level security')) {
                console.error('⚠️ RLS bloquea DELETE. Ejecuta: ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;');
            }
        }
        if (localSongs.length > 0) {
            const songsToInsert = localSongs.map(song => {
                const songCopy = { ...song };
                if (songCopy.audio_url) songCopy.audio_url = normalizeVocalAudioUrl(songCopy.audio_url);
                return { user_id: currentUser.id, song_data: songCopy, created_at: song.createdAt || Date.now(), updated_at: song.updatedAt || Date.now() };
            });
            for (let i = 0; i < songsToInsert.length; i += 50) {
                const batch = songsToInsert.slice(i, i + 50);
                const { error } = await supabaseClient.from('user_songs').insert(batch);
                if (error) throw error;
            }
        }
        syncInProgress = false;
        pendingSync = false;
        updateSyncStatus('synced');
    } catch (e) {
        console.error('Error syncing to cloud:', e);
        syncInProgress = false;
        pendingSync = true;
        updateSyncStatus('error');
        if (e.code === '42501' || (e.message && e.message.includes('row-level security'))) {
            console.error('⚠️ Error de RLS en user_songs. Ejecuta: ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;');
        }
    }
}

async function loadSongsFromCloud() {
    if (!currentUser || !supabaseReady) return null;
    updateSyncStatus('loading');
    try {
        const { data, error } = await supabaseClient.from('user_songs').select('song_data').eq('user_id', currentUser.id).limit(10000);
        if (error) throw error;
        if (data && data.length > 0) {
            const cloudSongs = data.map(d => {
                try {
                    const parsed = typeof d.song_data === 'string' ? JSON.parse(d.song_data) : d.song_data;
                    if (parsed && parsed.audio_url) parsed.audio_url = normalizeVocalAudioUrl(parsed.audio_url);
                    return parsed;
                } catch (e) { return null }
            }).filter(s => s !== null);
            save('cb_songs', cloudSongs);
            updateSyncStatus('synced');
            return cloudSongs;
        }
        updateSyncStatus('synced');
        return null;
    } catch (e) {
        console.error('Error loading from cloud:', e);
        updateSyncStatus('error');
        return null;
    }
}

// ============= REALTIME SUBSCRIPTIONS =============
function setupRealtimeSubscriptions() {
    if (!supabaseReady || !supabaseClient) return;
    console.log('Setting up Supabase Realtime subscriptions...');

    supabaseClient.channel('vocal-notes-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vocal_notes' }, function(payload) {
            console.log('Realtime vocal_notes change:', payload.eventType);
            vocalNotesCache = {};
            if (viewingSongId) renderView();
            if (viewingRepSongId) renderRepSongLyrics();
        })
        .subscribe();

    supabaseClient.channel('repertorios-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'repertorios' }, function(payload) {
            console.log('Realtime repertorios change:', payload.eventType);
            loadRepertorios().then(function() {
                if (document.getElementById('page-repertorios')?.classList.contains('active')) renderRepertorios();
                if (document.getElementById('page-repertorio')?.classList.contains('active')) renderRepertorioView();
                if (document.getElementById('page-rep-song')?.classList.contains('active')) renderRepSongLyrics();
            });
        })
        .subscribe();

    supabaseClient.channel('canciones-rep-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'canciones_repertorio' }, function(payload) {
            console.log('Realtime canciones_repertorio change:', payload.eventType);
            loadRepertorios().then(function() {
                if (document.getElementById('page-repertorios')?.classList.contains('active')) renderRepertorios();
                if (document.getElementById('page-repertorio')?.classList.contains('active')) renderRepertorioView();
            });
        })
        .subscribe();

    console.log('Realtime subscriptions active');
}

setTimeout(setupRealtimeSubscriptions, 2000);

// ============= AUTH SYSTEM =============
function initAuth() {
    const saved = localStorage.getItem('rl_current_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            userRole = currentUser.role || 'usuario';
            repAdmin = (userRole === 'admin');
            if (currentUser && currentUser.id === 'admin') repAdmin = true;
            if (currentUser && supabaseReady) {
                console.log('User logged in, loading songs from cloud...');
                loadSongsFromCloud().then(cloudSongs => {
                    if (cloudSongs && cloudSongs.length > 0) {
                        songs = cloudSongs;
                        renderLibrary();
                        console.log('Loaded', cloudSongs.length, 'songs from cloud on init');
                    }
                });
            }
        } catch (e) { currentUser = null }
    }
    updateUserUI();
}

function updateUserUI() {
    const avatar = document.getElementById('user-avatar-btn');
    const nameBtn = document.getElementById('user-name-btn');
    const dropdownContent = document.getElementById('user-dropdown-content');

    if (currentUser) {
        const displayName = currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id;
        const initials = currentUser.nombre ? currentUser.nombre[0] + (currentUser.apellido ? currentUser.apellido[0] : '') : currentUser.id.substring(0, 2);
        avatar.textContent = initials.toUpperCase();
        nameBtn.textContent = currentUser.id;

        dropdownContent.innerHTML = `
            <div style="padding:8px 12px;border-bottom:1px solid rgba(63,63,70,.5);margin-bottom:4px">
                <div style="font-size:.8rem;font-weight:600;color:#fff">${esc(displayName.trim())}</div>
                <div style="font-size:.7rem;color:#71717a">@${esc(currentUser.id)}</div>
            </div>
            <button class="user-dropdown-item" onclick="showChangePasswordModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Cambiar contraseña
            </button>
            <div class="user-dropdown-divider"></div>
            <button class="user-dropdown-item" onclick="handleLogout()" style="color:#f87171">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar sesión
            </button>
        `;
    } else {
        avatar.textContent = '?';
        nameBtn.textContent = 'Invitado';

        dropdownContent.innerHTML = `
            <div style="padding:8px 12px;border-bottom:1px solid rgba(63,63,70,.5);margin-bottom:4px">
                <div style="font-size:.8rem;color:#a1a1aa">Modo local</div>
                <div style="font-size:.7rem;color:#71717a">Tus datos no se sincronizan</div>
            </div>
            <button class="user-dropdown-item" onclick="showAuthModal('login')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10,17 15,12 10,7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Iniciar sesión
            </button>
            <button class="user-dropdown-item" onclick="showAuthModal('register')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                Crear cuenta
            </button>
        `;
    }
}

function toggleUserMenu() {
    document.getElementById('user-dropdown').classList.toggle('active');
}

document.addEventListener('click', function(e) {
    const menu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('user-dropdown');
    if (menu && !menu.contains(e.target)) dropdown.classList.remove('active');
});

function showAuthModal(tab) {
    document.getElementById('auth-modal').classList.add('active');
    switchAuthTab(tab || 'login');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.remove('active');
    document.getElementById('auth-error').classList.remove('show');
    document.getElementById('auth-success').classList.remove('show');
}

function switchAuthTab(tab) {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (tab === 'login') {
        tabs[0].classList.add('active');
        document.getElementById('auth-login-form').style.display = 'block';
        document.getElementById('auth-register-form').style.display = 'none';
    } else {
        tabs[1].classList.add('active');
        document.getElementById('auth-login-form').style.display = 'none';
        document.getElementById('auth-register-form').style.display = 'block';
    }
    document.getElementById('auth-error').classList.remove('show');
    document.getElementById('auth-success').classList.remove('show');
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.add('show');
    document.getElementById('auth-success').classList.remove('show');
}

function showAuthSuccess(msg) {
    const el = document.getElementById('auth-success');
    el.textContent = msg;
    el.classList.add('show');
    document.getElementById('auth-error').classList.remove('show');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) { showAuthError('Por favor completa todos los campos'); return }
    if (!supabaseReady) { showAuthError('Sin conexión a internet. No se puede iniciar sesión.'); return }
    try {
        const { data, error } = await supabaseClient.from('admin_users').select('*').eq('id', username.toLowerCase()).eq('password_hash', password).single();
        if (error || !data) { showAuthError('Usuario o contraseña incorrectos'); return }
        await supabaseClient.from('admin_users').update({ created_at: Date.now() }).eq('id', data.id);
        currentUser = { id: data.id, nombre: data.nombre || '', apellido: data.apellido || '', role: data.role || 'usuario' };
        localStorage.setItem('rl_current_user', JSON.stringify(currentUser));
        userRole = currentUser.role;
        repAdmin = (userRole === 'admin');
        if (userRole === 'admin') localStorage.setItem('cb_rep_admin', 'true');
        updateUserUI();
        closeAuthModal();

        const cloudSongs = await loadSongsFromCloud();
        if (cloudSongs && cloudSongs.length > 0) {
            songs = cloudSongs;
            renderLibrary();
            showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! ' + cloudSongs.length + ' canciones sincronizadas.', 'success');
        } else {
            if (songs.length > 0) {
                await syncSongsToCloud();
                showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! ' + songs.length + ' canciones subidas al servidor.', 'success');
            } else {
                showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! Tu biblioteca está vacía.', 'success');
            }
            renderLibrary();
        }
    } catch (e) {
        showAuthError('Error al conectar: ' + e.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const apellido = document.getElementById('reg-apellido').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;
    if (!nombre || !apellido || !username || !password) { showAuthError('Por favor completa todos los campos'); return }
    if (username.toLowerCase() === 'admin') { showAuthError('Este usuario está reservado'); return }
    if (password !== passwordConfirm) { showAuthError('Las contraseñas no coinciden'); return }
    if (password.length < 4) { showAuthError('La contraseña debe tener al menos 4 caracteres'); return }
    if (!supabaseReady) { showAuthError('Sin conexión a internet. No se puede registrar.'); return }
    try {
        const { data: existing } = await supabaseClient.from('admin_users').select('id').eq('id', username.toLowerCase()).single();
        if (existing) { showAuthError('Este usuario ya está registrado'); return }
        const { error } = await supabaseClient.from('admin_users').insert({ id: username.toLowerCase(), nombre: nombre, apellido: apellido, password_hash: password, created_at: Date.now() });
        if (error) throw error;
        showAuthSuccess('¡Cuenta creada! Ahora puedes iniciar sesión.');
        switchAuthTab('login');
        document.getElementById('login-username').value = username.toLowerCase();
        document.getElementById('login-password').value = password;
    } catch (e) {
        showAuthError('Error al registrar: ' + e.message);
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('rl_current_user');
    repAdmin = false;
    userRole = 'usuario';
    localStorage.removeItem('cb_rep_admin');
    updateUserUI();
    document.getElementById('user-dropdown').classList.remove('active');
    showNotification('Sesión cerrada', 'success');
    renderLibrary();
}

function showChangePasswordModal() {
    document.getElementById('user-dropdown').classList.remove('active');
    document.getElementById('change-password-modal').classList.add('active');
    document.getElementById('cp-error').classList.remove('show');
    document.getElementById('cp-success').classList.remove('show');
    document.getElementById('cp-old-password').value = '';
    document.getElementById('cp-new-password').value = '';
    document.getElementById('cp-new-password-confirm').value = '';
}

function closeChangePasswordModal() {
    document.getElementById('change-password-modal').classList.remove('active');
}

async function handleChangePassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById('cp-old-password').value;
    const newPass = document.getElementById('cp-new-password').value;
    const newPassConfirm = document.getElementById('cp-new-password-confirm').value;
    if (!oldPass || !newPass || !newPassConfirm) {
        document.getElementById('cp-error').textContent = 'Completa todos los campos';
        document.getElementById('cp-error').classList.add('show');
        return;
    }
    if (newPass !== newPassConfirm) {
        document.getElementById('cp-error').textContent = 'Las contraseñas nuevas no coinciden';
        document.getElementById('cp-error').classList.add('show');
        return;
    }
    if (newPass.length < 4) {
        document.getElementById('cp-error').textContent = 'La contraseña debe tener al menos 4 caracteres';
        document.getElementById('cp-error').classList.add('show');
        return;
    }
    if (!supabaseReady || !currentUser) {
        document.getElementById('cp-error').textContent = 'Error de conexión';
        document.getElementById('cp-error').classList.add('show');
        return;
    }
    try {
        const { data, error } = await supabaseClient.from('admin_users').select('id').eq('id', currentUser.id).eq('password_hash', oldPass).single();
        if (error || !data) {
            document.getElementById('cp-error').textContent = 'La contraseña actual es incorrecta';
            document.getElementById('cp-error').classList.add('show');
            return;
        }
        const { error: updateError } = await supabaseClient.from('admin_users').update({ password_hash: newPass }).eq('id', currentUser.id);
        if (updateError) throw updateError;
        document.getElementById('cp-success').textContent = '¡Contraseña actualizada!';
        document.getElementById('cp-success').classList.add('show');
        document.getElementById('cp-error').classList.remove('show');
        setTimeout(() => closeChangePasswordModal(), 1500);
    } catch (e) {
        document.getElementById('cp-error').textContent = 'Error: ' + e.message;
        document.getElementById('cp-error').classList.add('show');
    }
}

initAuth();

// ============= RE PERTORIOS FUNCTIONS =============
async function loadRepertorios() {
    if (!supabaseReady) return;
    try {
        const { data: reps, error: e1 } = await supabaseClient.from('repertorios').select('*').order('fecha_domingo', { ascending: false });
        if (e1) throw e1;
        const { data: songsData, error: e2 } = await supabaseClient.from('canciones_repertorio').select('*');
        if (e2) throw e2;

        let vocalAudios = [];
        try {
            const { data: vaData, error: vaErr } = await supabaseClient.from('vocal_audios').select('*');
            if (!vaErr && vaData) vocalAudios = vaData.map(va => ({ ...va, audio_url: va.audio_url ? normalizeVocalAudioUrl(va.audio_url) : va.audio_url }));
        } catch (e) { console.log('vocal_audios table may not exist yet') }

        const vocalAudiosBySong = {};
        vocalAudios.forEach(va => {
            const key = va.source_song_id || va.cancion_repertorio_id;
            if (!vocalAudiosBySong[key]) vocalAudiosBySong[key] = [];
            vocalAudiosBySong[key].push(va);
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const r of reps) {
            if (r.estado === 'activo' && r.fecha_lunes) {
                const lunesDate = new Date(r.fecha_lunes + 'T12:00:00');
                lunesDate.setHours(0, 0, 0, 0);
                if (lunesDate < today) {
                    r.estado = 'archivado';
                    try { await supabaseClient.from('repertorios').update({ estado: 'archivado' }).eq('id', r.id) } catch (e) { console.log('Auto-archive error:', e.message) }
                }
            }
        }

        repertorios = reps.sort((a, b) => b.fecha_domingo > a.fecha_domingo ? 1 : -1).map(r => {
            const canciones = songsData.filter(s => s.repertorio_id === r.id).sort((a, b) => a.orden - b.orden);
            const repVocalAudios = [];
            canciones.forEach(s => {
                const key = s.source_song_id || s.id;
                if (vocalAudiosBySong[key]) {
                    vocalAudiosBySong[key].forEach(va => {
                        if (!repVocalAudios.find(x => x.source_song_id === va.source_song_id && x.coro_number === va.coro_number && x.dia === va.dia)) {
                            repVocalAudios.push(va);
                        }
                    });
                }
            });
            return { ...r, canciones, vocalAudios: repVocalAudios };
        });
        console.log('Loaded', repertorios.length, 'repertorios');
    } catch (err) {
        console.error('Error loading repertorios:', err);
        const c = document.getElementById('rep-list');
        if (c) c.innerHTML = '<div class="empty"><h2 style="color:#f87171">Error de conexión</h2><p>' + err.message + '</p></div>';
    }
}

function showConnectionStatus() {
    const status = document.getElementById('rep-connection-status');
    if (!status) return;
    if (supabaseReady) { status.innerHTML = '<span style="color:#4ade80;font-size:.65rem">● Conectado</span>' } else { status.innerHTML = '<span style="color:#f87171;font-size:.65rem">● Sin conexión - datos locales</span>' }
}

function getSongNoteHtml(s) {
    if (!s) return '';
    var html = '<div style="margin-top:10px;padding:8px 10px;background:rgba(39,39,42,.3);border:1px solid rgba(63,63,70,.3);border-radius:8px;font-size:.7rem;color:#71717a;line-height:1.6">';
    var createdDate = (s.createdAt || s.created_at) ? new Date(s.createdAt || s.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    var createdBy = s.createdBy || s.created_by || '';
    var modifiedDate = (s.updatedAt && s.updatedAt !== s.createdAt) ? new Date(s.updatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    var modifiedBy = s.modifiedBy || s.modified_by || s.modificado_por || '';
    if (!modifiedDate && s.fecha_modificacion) { modifiedDate = new Date(s.fecha_modificacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) }
    if (createdDate && createdBy) { html += '<div>📅 Fecha de creación: ' + createdDate + ' — Creado por: <span style="color:#a1a1aa">' + esc(createdBy) + '</span></div>' } else if (createdDate) { html += '<div>📅 Fecha de creación: ' + createdDate + '</div>' }
    if (modifiedDate && modifiedBy) { html += '<div>✏️ Última modificación: ' + modifiedDate + ' — Modificado por: <span style="color:#a1a1aa">' + esc(modifiedBy) + '</span></div>' }
    html += '</div>';
    return html;
}

// ============= VOCAL NOTES FUNCTIONS =============
async function loadSectionNotes(sourceSongId, dia) {
    var cacheKey = sourceSongId + '_' + dia;
    if (vocalNotesCache[cacheKey] !== undefined) return vocalNotesCache[cacheKey];
    if (!supabaseReady || !sourceSongId) { vocalNotesCache[cacheKey] = {}; return {} }
    try {
        var result = await supabaseClient.from('vocal_notes').select('notas').eq('source_song_id', sourceSongId).eq('dia', dia).maybeSingle();
        var raw = (result.data && result.data.notas) ? result.data.notas : '';
        var parsed = {};
        if (raw) { try { parsed = JSON.parse(raw) } catch (e) { parsed = { '_raw': raw } } }
        vocalNotesCache[cacheKey] = parsed;
        return parsed;
    } catch (e) { console.log('loadSectionNotes error:', e.message);
        vocalNotesCache[cacheKey] = {}; return {} }
}

async function saveSectionNote(sourceSongId, dia, sectionName, noteText) {
    var cacheKey = sourceSongId + '_' + dia;
    var notes = await loadSectionNotes(sourceSongId, dia);
    if (noteText) { notes[sectionName] = noteText } else { delete notes[sectionName] }
    vocalNotesCache[cacheKey] = notes;
    if (!supabaseReady || !sourceSongId) return;
    var userName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
    var notasStr = JSON.stringify(notes);
    try {
        var existing = await supabaseClient.from('vocal_notes').select('id').eq('source_song_id', sourceSongId).eq('dia', dia).maybeSingle();
        if (existing.data && existing.data.id) {
            await supabaseClient.from('vocal_notes').update({ notas: notasStr, updated_at: Date.now() }).eq('id', existing.data.id);
        } else {
            await supabaseClient.from('vocal_notes').insert({ source_song_id: sourceSongId, dia: dia, notas: notasStr, created_by: userName, created_at: Date.now(), updated_at: Date.now() });
        }
    } catch (e) { console.error('saveSectionNote error:', e.message) }
}

function onSectionNoteInput(sourceSongId, dia, sectionName, input) {
    var cacheKey = sourceSongId + '_' + dia + '_' + sectionName;
    var notes = vocalNotesCache[sourceSongId + '_' + dia] || {};
    if (input.value) { notes[sectionName] = input.value } else { delete notes[sectionName] }
    vocalNotesCache[sourceSongId + '_' + dia] = notes;
    var statusEl = input.parentNode.querySelector('.section-note-status');
    if (statusEl) { statusEl.textContent = 'Guardando...';
        statusEl.style.color = '#fbbf24' }
    if (vocalNotesTimers[cacheKey]) clearTimeout(vocalNotesTimers[cacheKey]);
    vocalNotesTimers[cacheKey] = setTimeout(async function() {
        await saveSectionNote(sourceSongId, dia, sectionName, input.value);
        if (statusEl) { statusEl.textContent = '\u2713';
            statusEl.style.color = '#4ade80';
            setTimeout(function() { statusEl.textContent = '' }, 1500) }
    }, 800);
}

function toggleVocalNotesLib(sourceSongId, dia, btnEl) {
    if (libVocalMode === dia) { libVocalMode = null } else { libVocalMode = dia }
    vocalNotesCache = {};
    renderView();
}

// ============= AUDIO FUNCTIONS =============
function stopAllAudio() {
    if (viewAudioEl) { viewAudioEl.pause();
        viewAudioEl.currentTime = 0;
        viewAudioEl = null;
        viewAudioPlaying = false;
        stopViewAudioProgress() }
    if (repAudioEl) { repAudioEl.pause();
        repAudioEl.currentTime = 0;
        repAudioEl = null;
        repAudioPlaying = false;
        stopAudioProgress() }
    Object.keys(vocalAudioPlayers).forEach(function(k) { try { vocalAudioPlayers[k].pause();
            vocalAudioPlayers[k].currentTime = 0 } catch (e) {} });
    vocalAudioPlayers = {};
    vocalAudioCurrentKey = null;
    stopVocalAudioProgress();
    updateViewAudioBtn();
    updateAudioBtn();
    updateVocalAudioButtons();
}

function updateVocalAudioButtons() {
    document.querySelectorAll('[data-vocal-key]').forEach(function(btn) {
        var key = btn.getAttribute('data-vocal-key');
        if (vocalAudioCurrentKey === key) {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            btn.style.color = '#f59e0b';
        } else {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            btn.style.color = '#4ade80';
        }
    });
    updateVocalAudioPlayerBar();
}

function startVocalAudioProgress() {
    stopVocalAudioProgress();
    vocalAudioInterval = setInterval(function() {
        var audio = vocalAudioPlayers[vocalAudioCurrentKey];
        if (!audio) return;
        var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        var fill = document.getElementById('vocal-audio-fill');
        if (fill) fill.style.width = pct + '%';
        var cur = document.getElementById('vocal-audio-current');
        if (cur) cur.textContent = formatTime(audio.currentTime);
        var dur = document.getElementById('vocal-audio-duration');
        if (dur) dur.textContent = audio.duration ? formatTime(audio.duration) : '--:--';
    }, 250);
}

function stopVocalAudioProgress() {
    if (vocalAudioInterval) { clearInterval(vocalAudioInterval);
        vocalAudioInterval = null }
}

function seekVocalAudio(e) {
    var audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio || !audio.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
}

function seekVocalAudioTouch(e) {
    var audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio || !audio.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var touch = e.touches[0];
    var pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
}

function updateVocalAudioPlayerBar() {
    var bar = document.getElementById('vocal-audio-player-bar');
    if (!bar) return;
    if (vocalAudioCurrentKey && vocalAudioPlayers[vocalAudioCurrentKey]) {
        bar.style.display = 'flex';
        startVocalAudioProgress();
    } else {
        bar.style.display = 'none';
        stopVocalAudioProgress();
    }
}

function toggleVocalAudioFromBar() {
    var audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio) return;
    if (!audio.paused) { audio.pause();
        updateVocalAudioButtons() } else { audio.play().catch(function(e) { console.error(e) });
        updateVocalAudioButtons() }
}

function playVocalAudio(key, url) {
    url = normalizeVocalAudioUrl(url);
    if (vocalAudioCurrentKey === key && vocalAudioPlayers[key]) {
        if (!vocalAudioPlayers[key].paused) {
            vocalAudioPlayers[key].pause();
            stopVocalAudioProgress();
            updateVocalAudioButtons();
            return true;
        } else {
            vocalAudioPlayers[key].play().catch(function(e) { console.error('Resume error:', e) });
            startVocalAudioProgress();
            updateVocalAudioButtons();
            return true;
        }
    }
    if (vocalAudioCurrentKey && vocalAudioPlayers[vocalAudioCurrentKey]) {
        vocalAudioPlayers[vocalAudioCurrentKey].pause();
        vocalAudioPlayers[vocalAudioCurrentKey].currentTime = 0;
        delete vocalAudioPlayers[vocalAudioCurrentKey];
        vocalAudioCurrentKey = null;
    }
    if (repAudioEl) { repAudioEl.pause();
        repAudioPlaying = false;
        stopAudioProgress();
        updateAudioBtn() }
    if (viewAudioEl) { viewAudioEl.pause();
        viewAudioPlaying = false;
        stopViewAudioProgress();
        updateViewAudioBtn() }
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.addEventListener('error', function() {
        console.error('Vocal audio error for URL:', url);
        const err = audio.error;
        console.error('Error code:', err ? err.code : 'unknown', 'Message:', err ? err.message : 'unknown');
        if (url.includes('supabase.co')) {
            const pathMatch = url.match(/\/([^\/]+\/[^\/]+)$/);
            if (pathMatch) {
                const storagePath = pathMatch[1];
                console.log('Trying R2 fallback for:', storagePath);
                const r2Url = R2_WORKER_URL + '/file/' + encodeURIComponent(storagePath);
                audio.src = r2Url;
                audio.play().catch(function(e2) {
                    console.error('R2 fallback also failed:', e2);
                    showNotification('Error al reproducir audio. URL: ' + url, 'error');
                });
            } else {
                showNotification('Error al reproducir audio vocal', 'error');
            }
        } else {
            showNotification('Error al reproducir audio vocal', 'error');
        }
    });
    audio.addEventListener('ended', function() {
        delete vocalAudioPlayers[key];
        vocalAudioCurrentKey = null;
        stopVocalAudioProgress();
        updateVocalAudioButtons();
    });
    audio.src = url;
    vocalAudioPlayers[key] = audio;
    vocalAudioCurrentKey = key;
    audio.play().then(function() {
        console.log('Playing vocal audio:', url);
        updateVocalAudioButtons();
        startVocalAudioProgress();
    }).catch(function(e) {
        console.error('Play error:', e);
        delete vocalAudioPlayers[key];
        vocalAudioCurrentKey = null;
        showNotification('No se pudo reproducir el audio vocal', 'error');
    });
    return true;
}

// ============= VIEW AUDIO FUNCTIONS =============
function toggleViewAudio() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s || !s.audio_url) return;
    const audioUrl = normalizeVocalAudioUrl(s.audio_url);
    if (!viewAudioEl) {
        viewAudioEl = new Audio();
        viewAudioEl.crossOrigin = 'anonymous';
        viewAudioEl.preload = 'auto';
        viewAudioEl.addEventListener('ended', () => { viewAudioPlaying = false;
            updateViewAudioBtn() });
        viewAudioEl.addEventListener('loadedmetadata', () => { const dur = document.getElementById('view-audio-duration'); if (dur) dur.textContent = formatTime(viewAudioEl.duration) });
        viewAudioEl.addEventListener('error', () => {
            const err = viewAudioEl.error;
            console.error('Audio error:', err ? 'Code: ' + err.code + ', Message: ' + err.message : 'Unknown', 'URL:', audioUrl);
            if (s.id) { const r2Url = R2_WORKER_URL + '/file/songs/' + s.id + '.mp3';
                console.log('Trying R2 fallback:', r2Url);
                viewAudioEl.src = r2Url } else { alert('Error al cargar el audio');
                viewAudioPlaying = false;
                updateViewAudioBtn() }
        });
        viewAudioEl.src = audioUrl;
    }
    if (viewAudioPlaying) { viewAudioEl.pause();
        viewAudioPlaying = false } else { viewAudioEl.play().catch(e => { console.error('Play error:', e) });
        viewAudioPlaying = true }
    updateViewAudioBtn();
}

function updateViewAudioBtn() {
    const icon = document.getElementById('view-audio-icon');
    if (!icon) return;
    if (viewAudioPlaying) {
        icon.outerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5" id="view-audio-icon"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        startViewAudioProgress();
    } else {
        icon.outerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg>';
        stopViewAudioProgress();
    }
}

function startViewAudioProgress() {
    stopViewAudioProgress();
    viewAudioInterval = setInterval(() => {
        if (!viewAudioEl) return;
        const pct = viewAudioEl.duration ? (viewAudioEl.currentTime / viewAudioEl.duration) * 100 : 0;
        const fill = document.getElementById('view-audio-fill');
        if (fill) fill.style.width = pct + '%';
        const cur = document.getElementById('view-audio-current');
        if (cur) cur.textContent = formatTime(viewAudioEl.currentTime);
    }, 250);
}

function stopViewAudioProgress() { if (viewAudioInterval) { clearInterval(viewAudioInterval);
        viewAudioInterval = null } }

function seekViewAudio(e) {
    if (!viewAudioEl || !viewAudioEl.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    viewAudioEl.currentTime = pct * viewAudioEl.duration;
}

function seekViewAudioTouch(e) {
    if (!viewAudioEl || !viewAudioEl.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var touch = e.touches[0];
    var pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    viewAudioEl.currentTime = pct * viewAudioEl.duration;
}

// ============= REP AUDIO FUNCTIONS =============
function toggleRepAudio() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === viewingRepSongId);
    if (!s || !s.audio_url) return;
    const audioUrl = normalizeVocalAudioUrl(s.audio_url);
    if (!repAudioEl) {
        repAudioEl = new Audio();
        repAudioEl.crossOrigin = 'anonymous';
        repAudioEl.preload = 'auto';
        repAudioEl.src = audioUrl;
        repAudioEl.addEventListener('ended', () => { repAudioPlaying = false;
            updateAudioBtn() });
        repAudioEl.addEventListener('loadedmetadata', () => { const dur = document.getElementById('rep-audio-duration'); if (dur) dur.textContent = formatTime(repAudioEl.duration) });
        repAudioEl.addEventListener('error', () => {
            console.error('Rep audio error, URL:', audioUrl);
            if (s.id) { const r2Url = R2_WORKER_URL + '/file/songs/' + s.id + '.mp3';
                repAudioEl.src = r2Url } else { alert('Error al cargar el audio');
                repAudioPlaying = false;
                updateAudioBtn() }
        });
    }
    if (repAudioPlaying) { repAudioEl.pause();
        repAudioPlaying = false } else { repAudioEl.play().catch(e => { console.error('Audio play error:', e) });
        repAudioPlaying = true }
    updateAudioBtn();
}

function updateAudioBtn() {
    const btn = document.querySelector('.audio-play-btn');
    if (!btn) return;
    btn.innerHTML = repAudioPlaying ?
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' :
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg>';
    if (repAudioPlaying) { startAudioProgress() } else { stopAudioProgress() }
}

function startAudioProgress() {
    stopAudioProgress();
    repAudioInterval = setInterval(() => {
        if (!repAudioEl) return;
        const pct = repAudioEl.duration ? (repAudioEl.currentTime / repAudioEl.duration) * 100 : 0;
        const fill = document.getElementById('rep-audio-fill');
        if (fill) fill.style.width = pct + '%';
        const cur = document.getElementById('rep-audio-current');
        if (cur) cur.textContent = formatTime(repAudioEl.currentTime);
    }, 250);
}

function stopAudioProgress() { if (repAudioInterval) { clearInterval(repAudioInterval);
        repAudioInterval = null } }

function seekRepAudio(e) {
    if (!repAudioEl || !repAudioEl.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    repAudioEl.currentTime = pct * repAudioEl.duration;
}

function seekRepAudioTouch(e) {
    if (!repAudioEl || !repAudioEl.duration) return;
    var bar = e.currentTarget;
    var rect = bar.getBoundingClientRect();
    var touch = e.touches[0];
    var pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    repAudioEl.currentTime = pct * repAudioEl.duration;
}

// ============= AUDIO UPLOAD FUNCTIONS =============
async function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file || !audioUploadSongId) return;
    if (!supabaseReady) { alert('Sin conexión a Supabase'); return }

    const si = songs.findIndex(s => s.id === audioUploadSongId);
    if (si === -1) { alert('Canción no encontrada');
        e.target.value = '';
        audioUploadSongId = null; return }
    const songTitle = songs[si].title;
    const songId = songs[si].id;

    const sendFilename = songId + '.mp3';

    const zone = document.getElementById('view-upload-zone');
    if (zone) { zone.innerHTML = '<div class="upload-progress"><div class="upload-progress-bar"><div class="upload-progress-fill" id="upload-fill" style="width:10%"></div></div><p style="font-size:.75rem;color:#a1a1aa;margin-top:8px">Subiendo ' + esc(songTitle) + '...</p></div>' }

    const btn = document.querySelector('[data-audio-upload="' + audioUploadSongId + '"]');
    if (btn) btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/></svg>';

    try {
        const fill = document.getElementById('upload-fill');
        if (fill) fill.style.width = '15%';

        const pathsToDelete = new Set();
        if (songs[si].audio_url) {
            try { const storedKey = extractR2Key(songs[si].audio_url);
                pathsToDelete.add(storedKey) } catch (e) {}
        }
        try {
            const { data: repSongs } = await supabaseClient.from('canciones_repertorio').select('audio_url').eq('source_song_id', songId);
            if (repSongs) {
                repSongs.forEach(rs => { if (rs.audio_url) { try { const p = extractR2Key(rs.audio_url);
                            pathsToDelete.add(p) } catch (e) {} } });
            }
        } catch (e) {}
        try {
            const { data: userSongs } = await supabaseClient.from('user_songs').select('song_data');
            if (userSongs) {
                for (const us of userSongs) {
                    try {
                        const sd = typeof us.song_data === 'string' ? JSON.parse(us.song_data) : us.song_data;
                        if (sd && (sd.id === songId || (sd.sourceId && sd.sourceId === songId))) {
                            if (sd.audio_url) { const p = extractR2Key(sd.audio_url);
                                pathsToDelete.add(p) }
                        }
                    } catch (parseErr) {}
                }
            }
        } catch (e) {}

        for (const delPath of pathsToDelete) {
            try { await fetch(R2_WORKER_URL + '/file/' + encodeURIComponent(delPath), { method: 'DELETE' }) } catch (e) {}
        }

        if (fill) fill.style.width = '35%';

        const renamedFile = new File([file], sendFilename, { type: file.type || 'audio/mpeg' });
        const formData = new FormData();
        formData.append('file', renamedFile);
        formData.append('folder', 'songs');
        const uploadRes = await fetch(R2_WORKER_URL + '/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();

        if (uploadData.error) {
            alert('Error al subir audio: ' + uploadData.error);
            if (viewingSongId === audioUploadSongId) { renderView() } else { renderLibrary() }
            e.target.value = '';
            audioUploadSongId = null;
            return;
        }

        if (fill) fill.style.width = '65%';

        const audioUrl = normalizeVocalAudioUrl(uploadData.url);
        if (!audioUrl) {
            alert('Error: Worker no devolvió URL');
            if (viewingSongId === audioUploadSongId) { renderView() } else { renderLibrary() }
            e.target.value = '';
            audioUploadSongId = null;
            return;
        }

        songs[si].audio_url = audioUrl;
        save('cb_songs', songs);

        if (currentUser && supabaseReady) {
            try { await syncSongsToCloud() } catch (e) { console.log('syncSongsToCloud after upload failed:', e.message) }
        }

        if (fill) fill.style.width = '80%';

        try {
            await supabaseClient.from('canciones_repertorio').update({ audio_url: audioUrl }).eq('source_song_id', songId);
            try {
                await syncRepertorioToAllUsers({
                    titulo: songTitle,
                    artista: songs[si].artist,
                    letra_acordes: songs[si].lyrics,
                    tono_original: songs[si].originalKey,
                    tempo: songs[si].tempo,
                    compas: songs[si].compas,
                    audio_url: audioUrl
                }, songId);
            } catch (syncErr) { console.error('syncRepertorioToAllUsers failed:', syncErr) }
        } catch (dbErr) { console.log('DB update error:', dbErr.message) }

        try { await loadRepertorios() } catch (e) { console.log('Reload repertorios error:', e.message) }

        if (fill) fill.style.width = '100%';
        await new Promise(r => setTimeout(r, 500));

        if (viewingSongId === audioUploadSongId) { renderView() } else { renderLibrary() }
        if (viewingRepId) { renderRepertorioView() }

        showNotif('import-notification', 'Audio vinculado a "' + songTitle + '"', 'success');

    } catch (err) {
        alert('Error al subir audio: ' + err.message);
        if (viewingSongId === audioUploadSongId) { renderView() } else { renderLibrary() }
    }
    e.target.value = '';
    audioUploadSongId = null;
}

function triggerAudioUpload(songId) { audioUploadSongId = songId;
    document.getElementById('audio-upload-input').click() }

async function removeSongAudio(songId) {
    if (!confirm('¿Eliminar el audio vinculado a esta canción?')) return;
    const si = songs.findIndex(s => s.id === songId);
    if (si === -1) return;
    const s = songs[si];

    const extensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'];
    for (const ext of extensions) {
        try { await fetch(R2_WORKER_URL + '/file/songs/' + songId + '.' + ext, { method: 'DELETE' }) } catch (e) {}
    }
    if (s.audio_url) {
        try { await fetch(R2_WORKER_URL + '/file/' + extractR2Key(s.audio_url), { method: 'DELETE' }) } catch (e) {}
    }

    songs[si].audio_url = null;
    save('cb_songs', songs);

    try {
        await supabaseClient.from('canciones_repertorio').update({ audio_url: null }).eq('source_song_id', songId);
        const { data: userSongs } = await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
        if (userSongs) {
            for (const us of userSongs) {
                try {
                    const sd = JSON.parse(us.song_data);
                    if (sd.id === songId || (sd.sourceId && sd.sourceId === songId)) {
                        sd.audio_url = null;
                        await supabaseClient.from('user_songs').update({ song_data: JSON.stringify(sd), updated_at: Date.now() }).eq('id', us.id);
                    }
                } catch (parseErr) {}
            }
        }
    } catch (e) { console.log('Supabase update skipped:', e.message) }

    try { await loadRepertorios() } catch (e) { console.log("Reload repertorios error:", e.message) }
    if (viewingSongId === songId) { renderView() } else { renderLibrary() }
    if (viewingRepId) { renderRepertorioView() }
    showNotif('import-notification', 'Audio desvinculado de "' + s.title + '"', 'success');
}

// ============= SYNC REPERTORIO FUNCTIONS =============
async function syncRepertorioToAllUsers(cancion, songId) {
    if (!supabaseReady) return;
    try {
        const { data: matches, error: selErr } = await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
        if (selErr) { console.error('syncRepertorioToAllUsers select error:', selErr); return }
        if (!matches || matches.length === 0) { console.log('syncRepertorioToAllUsers: no user_songs found'); return }

        let updatedCount = 0;
        for (const m of matches) {
            try {
                const sd = typeof m.song_data === 'string' ? JSON.parse(m.song_data) : m.song_data;
                const matchesId = (sd.id === songId) || (sd.sourceId && sd.sourceId === songId) || (sd.repSongId && sd.repSongId === songId);
                if (matchesId) {
                    const updated = {
                        ...sd,
                        title: cancion.titulo || sd.title,
                        artist: cancion.artista || sd.artist,
                        lyrics: cancion.letra_acordes || sd.lyrics,
                        originalKey: cancion.tono_original || sd.originalKey,
                        tempo: cancion.tempo || sd.tempo,
                        compas: cancion.compas || sd.compas,
                        audio_url: ('audio_url' in cancion) ? cancion.audio_url : sd.audio_url,
                        createdBy: cancion.created_by || sd.createdBy || '',
                        modifiedBy: cancion.modified_by || cancion.modificado_por || sd.modifiedBy || '',
                        updatedAt: Date.now()
                    };
                    const { error: updErr } = await supabaseClient.from('user_songs').update({
                        song_data: JSON.stringify(updated),
                        updated_at: Date.now()
                    }).eq('id', m.id);
                    if (updErr) { console.error('syncRepertorioToAllUsers update error for', m.id, ':', updErr) } else { updatedCount++; }
                }
            } catch (parseErr) { console.error('syncRepertorioToAllUsers parse error:', parseErr) }
        }
        console.log('syncRepertorioToAllUsers: checked', matches.length, 'rows, updated', updatedCount, 'for song:', songId);
    } catch (e) { console.error('Sync to all users error:', e) }
}

async function syncRepertorioFromLibrary(libSong) {
    if (!supabaseReady) return;
    try {
        let repSongs = [];
        try {
            const { data: byId, error: e1 } = await supabaseClient.from('canciones_repertorio').select('*').eq('source_song_id', libSong.id);
            if (!e1 && byId && byId.length > 0) repSongs = byId;
        } catch (e) {}
        if (repSongs.length === 0) {
            try {
                const { data: byTitle, error: e2 } = await supabaseClient.from('canciones_repertorio').select('*').eq('titulo', libSong.title).eq('artista', libSong.artist);
                if (!e2 && byTitle) repSongs = byTitle;
            } catch (e) {}
        }
        if (repSongs.length === 0) return;
        const updates = {
            titulo: libSong.title,
            artista: libSong.artist,
            tono_original: libSong.originalKey,
            tempo: libSong.tempo || 0,
            compas: libSong.compas || '',
            letra_acordes: libSong.lyrics,
            audio_url: libSong.audio_url || null,
            fecha_modificacion: Date.now(),
            modificado_por: libSong.modifiedBy || '',
            modified_by: libSong.modifiedBy || ''
        };
        for (const rs of repSongs) {
            await supabaseClient.from('canciones_repertorio').update(updates).eq('id', rs.id);
        }
        console.log('Synced', repSongs.length, 'repertorio copies for:', libSong.title);
        await syncRepertorioToAllUsers({
            titulo: libSong.title,
            artista: libSong.artist,
            letra_acordes: libSong.lyrics,
            tono_original: libSong.originalKey,
            tempo: libSong.tempo,
            compas: libSong.compas,
            audio_url: libSong.audio_url,
            created_by: libSong.createdBy || '',
            modified_by: libSong.modifiedBy || ''
        }, libSong.id);
    } catch (e) { console.error('Sync repertorio error:', e) }
}

async function renumberRepSongs(repId) {
    const r = repertorios.find(x => x.id === repId);
    if (!r || !r.canciones.length) return;
    const sorted = [...r.canciones].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    for (let i = 0; i < sorted.length; i++) {
        const newOrder = i + 1;
        if (sorted[i].orden !== newOrder) {
            sorted[i].orden = newOrder;
            await supabaseClient.from('canciones_repertorio').update({ orden: newOrder }).eq('id', sorted[i].id);
        }
    }
}

// ============= LIBRARY FUNCTIONS =============
function renderGuestLibraryBanner() {
    const listEl = document.getElementById('song-list');
    if (!listEl) return;
    let banner = document.getElementById('guest-library-banner');
    if (currentUser) {
        if (banner) banner.remove();
        return;
    }
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'guest-library-banner';
        banner.style.cssText = 'margin-bottom:10px;padding:8px 10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:.72rem;color:#fbbf24;line-height:1.5';
        banner.innerHTML = '🔓 Estás sin cuenta: tu biblioteca solo se guarda en este dispositivo. Mira <a href="#" onclick="event.preventDefault();showPage(\'repertorios\')" style="color:#fbbf24;text-decoration:underline">Repertorios</a> para lo último, o <a href="#" onclick="event.preventDefault();showAuthModal(\'register\')" style="color:#fbbf24;text-decoration:underline">regístrate</a> para guardarla automáticamente.';
        listEl.parentNode.insertBefore(banner, listEl);
    }
}

function renderLibrary() {
    renderGuestLibraryBanner();
    const q = (document.getElementById('search-input').value || '').toLowerCase();
    let filtered = q ? songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)) : [...songs];
    filtered.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    document.getElementById('song-count').textContent = songs.length + ' canciones';
    const c = document.getElementById('song-list');
    if (filtered.length === 0) {
        c.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>' + (songs.length === 0 ? 'Sin canciones aún' : 'Sin resultados') + '</h2><p>' + (songs.length === 0 ? 'Agrega tu primera canción o importa archivos' : 'Intenta con otra búsqueda') + '</p>' + (songs.length === 0 ? '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-amber" onclick="showPage(\'add\')">Agregar canción</button><button class="btn btn-zinc" onclick="document.getElementById(\'import-input\').click()">Importar archivo</button></div>' : '') + '</div>';
        return;
    }
    c.innerHTML = filtered.map(s => {
        const pv = s.lyrics.split('\n').slice(0, 3).join(' / ');
        const il = lists.filter(l => l.songIds.includes(s.id)).length;
        return '<div class="card" onclick="viewSong(\'' + s.id + '\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1;min-width:0"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ' + esc(s.title) + (!canEditRepSongs() && isSongInAnyRepertorio(s.sourceId || s.id) ? ' 🔒' : '') + '</div><div class="card-artist">' + esc(s.artist) + '</div><div class="card-preview">' + esc(pv) + '</div><div class="card-meta"><span class="tag tag-key">' + dn(s.originalKey) + '</span>' + (s.tempo ? '<span class="tag tag-zinc">' + s.tempo + ' BPM</span>' : '') + (s.compas ? '<span class="tag tag-zinc">' + s.compas + '</span>' : '') + s.tags.slice(0, 2).map(t => '<span class="tag tag-zinc">' + esc(t) + '</span>').join('') + (il > 0 ? '<span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> ' + il + '</span>' : '') + (s.audio_url ? '<span class="tag" style="background:rgba(34,197,94,.2);color:#4ade80">🎵 Audio</span>' : '') + '</div></div><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' + (canUploadAudio() ? '<button class="btn-icon" onclick="event.stopPropagation();triggerAudioUpload(\'' + s.id + '\')" data-audio-upload="' + s.id + '" title="' + (s.audio_url ? 'Cambiar audio' : 'Subir audio') + '" style="color:' + (s.audio_url ? '#4ade80' : '#71717a') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>' : '') + '<button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteSong(\'' + s.id + '\')" title="Eliminar de biblioteca" style="flex-shrink:0;align-self:flex-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' + '</div></div></div>';
    }).join('');
}

function renderKeyGrid() {
    document.getElementById('key-grid-form').innerHTML = KEY_VALUES.map((k, i) =>
        '<button class="key-option ' + (formKey === k ? 'current' : 'other') + '" onclick="formKey=\'' + k + '\';renderKeyGrid()">' + KEY_NAMES[i] + '</button>'
    ).join('')
}

function resetForm() {
    editingSongId = null;
    document.getElementById('form-title').textContent = 'Nueva canción';
    document.getElementById('input-title').value = '';
    document.getElementById('input-artist').value = '';
    document.getElementById('input-lyrics').value = '';
    document.getElementById('input-tempo').value = '';
    document.getElementById('input-compas').value = '';
    formKey = 'C';
    formTags = [];
    renderFormTags();
    renderKeyGrid();
}

function renderFormTags() {
    document.getElementById('tag-list').innerHTML = formTags.map(t => '<span class="tag-item">' + esc(t) + ' <button class="tag-remove" onclick="removeFormTag(\'' + esc(t) + '\')">×</button></span>').join('')
}

function addTag() {
    const i = document.getElementById('input-tag'),
        t = i.value.trim();
    if (t && !formTags.includes(t)) { formTags.push(t);
        renderFormTags() }
    i.value = ''
}

function removeFormTag(t) { formTags = formTags.filter(x => x !== t);
    renderFormTags() }

function toggleHelp() { document.getElementById('help-box').classList.toggle('hidden') }

function saveSong() {
    const t = document.getElementById('input-title').value.trim(),
        a = document.getElementById('input-artist').value.trim() || 'Desconocido',
        l = document.getElementById('input-lyrics').value.trim();
    const bpm = parseInt(document.getElementById('input-tempo').value) || 0;
    const cmp = document.getElementById('input-compas').value.trim() || '';
    if (!t || !l) { alert('Título y letra son obligatorios'); return }
    if (editingSongId) {
        const i = songs.findIndex(s => s.id === editingSongId);
        if (i !== -1) {
            var userName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
            songs[i] = { ...songs[i], title: t, artist: a, lyrics: l, originalKey: formKey, tags: [...formTags], tempo: bpm || songs[i].tempo || 0, compas: cmp || songs[i].compas || '', audio_url: songs[i].audio_url || null, updatedAt: Date.now(), modifiedBy: userName || songs[i].modifiedBy || '' };
            syncRepertorioFromLibrary(songs[i]);
        }
    } else {
        var dk = detectKey(l);
        var creatorName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
        songs.unshift({ id: genId(), title: t, artist: a, lyrics: l, originalKey: formKey || dk, currentKey: formKey || dk, tags: [...formTags], tempo: bpm, compas: cmp, audio_url: null, createdAt: Date.now(), updatedAt: Date.now(), createdBy: creatorName || '' })
    }
    save('cb_songs', songs);
    editingSongId = null;
    showPage('library');
    if (currentUser && supabaseReady) { syncSongsToCloud() }
}

function viewSong(id) { viewingSongId = id;
    viewReturnTo = null;
    showPage('view') }

function editSong() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    if (!canEditRepSongs() && isSongInAnyRepertorio(s.sourceId || s.id)) { alert('Solo admin o directores musicales pueden editar canciones de repertorio'); return }
    editingSongId = s.id;
    document.getElementById('form-title').textContent = 'Editar canción';
    document.getElementById('input-title').value = s.title;
    document.getElementById('input-artist').value = s.artist;
    document.getElementById('input-lyrics').value = s.lyrics;
    document.getElementById('input-tempo').value = s.tempo || '';
    document.getElementById('input-compas').value = s.compas || '';
    formKey = s.originalKey;
    formTags = [...s.tags];
    renderFormTags();
    renderKeyGrid();
    showPage('add')
}

async function confirmDeleteSong(id) {
    const s = songs.find(x => x.id === id);
    if (!confirm('¿Eliminar esta canción de tu biblioteca?')) { return }
    const songId = s ? s.id : id;
    const uid = s ? (s.sourceId || s.id) : id;

    if (!s || !(await isSongAudioNeededElsewhere(uid))) {
        const extensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'];
        for (const ext of extensions) {
            try { await fetch(R2_WORKER_URL + '/file/songs/' + songId + '.' + ext, { method: 'DELETE' }) } catch (e) {}
        }
        if (s && s.audio_url) {
            try { await fetch(R2_WORKER_URL + '/file/' + extractR2Key(s.audio_url), { method: 'DELETE' }) } catch (e) {}
        }
    }

    songs = songs.filter(s => s.id !== id);
    lists.forEach(l => l.songIds = l.songIds.filter(sid => sid !== id));
    save('cb_songs', songs);
    save('cb_lists', lists);
    renderLibrary();
    if (currentUser && supabaseReady) { syncSongsToCloud() }
}

async function deleteCurrentSong() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!confirm('¿Eliminar esta canción de tu biblioteca?')) { return }
    const songId = s ? s.id : viewingSongId;
    const uid = s ? (s.sourceId || s.id) : viewingSongId;

    if (!s || !(await isSongAudioNeededElsewhere(uid))) {
        const extensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'];
        for (const ext of extensions) {
            try { await fetch(R2_WORKER_URL + '/file/songs/' + songId + '.' + ext, { method: 'DELETE' }) } catch (e) {}
        }
        if (s && s.audio_url) {
            try { await fetch(R2_WORKER_URL + '/file/' + extractR2Key(s.audio_url), { method: 'DELETE' }) } catch (e) {}
        }
    }

    songs = songs.filter(s => s.id !== viewingSongId);
    lists.forEach(l => l.songIds = l.songIds.filter(sid => sid !== viewingSongId));
    save('cb_songs', songs);
    save('cb_lists', lists);
    showPage('library');
    if (currentUser && supabaseReady) { syncSongsToCloud() }
}

function saveRepSongToLibrary() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return;
    const existing = songs.find(x => x.title === s.titulo && x.artist === s.artista);
    if (existing) { alert('Esta canción ya está en tu biblioteca'); return }
    const dk = s.tono_original || 'C';
    songs.unshift({ id: s.source_song_id || genId(), sourceId: s.source_song_id || s.id, repSongId: s.id, sourceType: 'repertorio', title: s.titulo || 'Sin título', artist: s.artista || 'Desconocido', lyrics: s.letra_acordes || '', originalKey: dk, currentKey: dk, tags: s.tags || ['Repertorio'], tempo: s.tempo || 0, compas: s.compas || '', audio_url: s.audio_url || null, repSongId: s.id, repId: r.id, createdAt: s.created_at || Date.now(), updatedAt: Date.now(), createdBy: s.created_by || '', modifiedBy: s.modified_by || s.modificado_por || '' });
    save('cb_songs', songs);
    const btn = document.getElementById('save-rep-btn');
    if (btn) { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Guardada';
        btn.style.background = 'rgba(34,197,94,.2)';
        btn.style.color = '#4ade80';
        btn.style.borderColor = 'rgba(34,197,94,.3)';
        btn.disabled = true }
    if (currentUser && supabaseReady) { syncSongsToCloud() }
}

function isRepSongInLibrary() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return false;
    const s = r.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return false;
    return !!songs.find(x => x.title === s.titulo && x.artist === s.artista)
}

// ============= VIEW FUNCTIONS =============
async function renderView() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    const nav = document.getElementById('view-nav');
    if (viewReturnTo === 'listview' && viewingListId) {
        const l = lists.find(x => x.id === viewingListId);
        if (l) {
            const listSongs = l.songIds.map(sid => songs.find(x => x.id === sid)).filter(Boolean);
            if (listSongs.length > 1) {
                nav.classList.remove('hidden');
                document.getElementById('view-nav-info').textContent = (listNavIndex + 1) + ' / ' + listSongs.length;
                document.getElementById('view-prev-btn').disabled = listNavIndex <= 0;
                document.getElementById('view-next-btn').disabled = listNavIndex >= listSongs.length - 1;
            } else { nav.classList.add('hidden') }
        } else { nav.classList.add('hidden') }
    } else { nav.classList.add('hidden') }

    const ntBtn = document.getElementById('lib-notation-toggle');
    if (ntBtn) ntBtn.innerHTML = useFlats ? '♭' : '#';
    const metaParts = [];
    if (s.tempo) metaParts.push(s.tempo + ' BPM');
    if (s.compas) metaParts.push(s.compas);
    document.getElementById('view-song-info').innerHTML = '<h1 style="font-size:1.1rem;font-weight:700;color:#fff">' + esc(s.title) + '</h1><p style="font-size:.8rem;color:#a1a1aa">' + esc(s.artist) + '</p>' + (metaParts.length > 0 ? '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' + metaParts.map(m => '<span class="tag tag-zinc">' + m + '</span>').join('') + '</div>' : '');

    var _vnSrc = s.sourceId || s.id;
    document.getElementById('view-key-selector').innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;width:100%">' +
        '<button class="key-btn" onclick="changeKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button>' +
        '<button id="lib-notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">' + (useFlats ? '\u266D' : '#') + '</button>' +
        '<div class="key-display"><div class="key-note">' + dn(s.currentKey) + '</div>' + (s.currentKey !== s.originalKey ? '<button class="key-original" onclick="resetKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: ' + dn(s.originalKey) + '</button>' : '') + '</div>' +
        '<button class="key-btn" onclick="changeKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>' +
        '<div class="lib-notes-row">' + (_vnSrc ? '<button class="lib-notes-btn" onclick="toggleVocalNotesLib(\'' + _vnSrc + '\',\'domingo\',this)">\u{1f4dd} Domingo</button><button class="lib-notes-btn" onclick="toggleVocalNotesLib(\'' + _vnSrc + '\',\'lunes\',this)">\u{1f4dd} Lunes</button>' : '') + '</div></div>';

    if (libVocalMode) {
        document.querySelectorAll('.lib-notes-btn').forEach(function(b) {
            b.classList.remove('active');
            if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf(libVocalMode) !== -1) b.classList.add('active')
        })
    }

    const il = lists.filter(l => l.songIds.includes(s.id));
    document.getElementById('view-song-location').innerHTML = il.length > 0 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> En listas: ' + il.map(l => l.name).join(', ') : '';

    const audioSection = document.getElementById('view-audio-section');
    if (s.audio_url) {
        audioSection.innerHTML = '<div class="audio-player" id="view-audio-player"><button class="audio-play-btn" onclick="toggleViewAudio()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekViewAudio(event)" ontouchmove="seekViewAudioTouch(event)"><div class="audio-bar-fill" id="view-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="view-audio-current">0:00</span><span id="view-audio-duration">--:--</span></div></div>' + (canUploadAudio() ? '<button class="btn-icon" onclick="triggerAudioUpload(\'' + s.id + '\')" title="Cambiar audio" style="color:#71717a"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button><button class="btn-icon btn-icon-red" onclick="removeSongAudio(\'' + s.id + '\')" title="Eliminar audio" style="color:#f87171"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') + '</div>';
    } else {
        audioSection.innerHTML = '' + (canUploadAudio() ? '<div class="upload-zone" onclick="triggerAudioUpload(\'' + s.id + '\')" id="view-upload-zone"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" style="margin:0 auto 8px;display:block"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p style="font-size:.8rem;color:#a1a1aa;margin-bottom:4px">Subir audio de esta canción</p><p style="font-size:.65rem;color:#71717a">MP3, WAV, OGG — el audio quedará vinculado a la canción</p></div>' : '') + '';
    }

    const semi = getS(s.originalKey, s.currentKey);
    var _vnSrc2 = s.sourceId || s.id;
    var _vocalNotes = {};
    if (libVocalMode && _vnSrc2) { _vocalNotes = await loadSectionNotes(_vnSrc2, libVocalMode) }

    if (libVocalMode) {
        var _libLines = [];
        s.lyrics.split('\n').forEach(function(line) {
            var t = semi !== 0 ? transposeLine(line, semi) : line;
            if (/\[[^\]]+\]/.test(t)) {
                var stripped = t.replace(/\s*\[[^\]]+\]\s*/g, ' ').trim();
                if (!stripped) { return }
                var h2 = '<div class="lyrics-line">';
                if (/\(([^)]+)\)/.test(t)) {
                    var secMatch = t.match(/\(([^)]+)\)/);
                    var secName = secMatch ? secMatch[1] : '';
                    var idMatch = t.match(/\)\s*\{(\d+)\}/);
                    var secId = idMatch ? idMatch[1] : '';
                    var noteKey = secId ? secName + '_' + secId : secName;
                    var noteVal = (_vocalNotes[noteKey] || '').replace(/"/g, '&quot;');
                    var displayLine = stripped.replace(/\s*\{\d+\}/g, '');
                    h2 += displayLine.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                    if (_vocalNotes[noteKey]) { h2 += '<span class="section-note-display">' + esc(_vocalNotes[noteKey]) + '</span>' }
                } else { h2 += stripped }
                _libLines.push(h2 + '</div>')
            } else if (/\(([^)]+)\)/.test(t)) {
                var secMatch2 = t.match(/\(([^)]+)\)/);
                var secName2 = secMatch2 ? secMatch2[1] : '';
                var idMatch2 = t.match(/\)\s*\{(\d+)\}/);
                var secId2 = idMatch2 ? idMatch2[1] : '';
                var noteKey2 = secId2 ? secName2 + '_' + secId2 : secName2;
                var noteVal2 = (_vocalNotes[noteKey2] || '').replace(/"/g, '&quot;');
                var displayLine2 = t.replace(/\s*\{\d+\}/g, '');
                var h3 = '<div class="lyrics-line">' + displayLine2.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                if (_vocalNotes[noteKey2]) { h3 += '<span class="section-note-display">' + esc(_vocalNotes[noteKey2]) + '</span>' }
                _libLines.push(h3 + '</div>')
            } else { _libLines.push('<div class="lyrics-line">' + (t || '&nbsp;') + '</div>') }
        });
        document.getElementById('view-lyrics').innerHTML = _libLines.join('')
    } else {
        document.getElementById('view-lyrics').innerHTML = s.lyrics.split('\n').map(line => {
            const t = semi !== 0 ? transposeLine(line, semi) : line;
            if (/\[[^\]]+\]/.test(t)) {
                let h = '<div class="lyrics-line">' + t.replace(/\[([^\]]+)\]/g, (m, p1) => '<span class="chord">' + displayChord(p1) + '</span>');
                h = h.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                h = h.replace(/\s*\{\d+\}/g, '');
                return h + '</div>'
            }
            if (/\([^)]+\)/.test(line)) {
                var _dl = line.replace(/\s*\{\d+\}/g, '');
                return '<div class="lyrics-line">' + _dl.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>') + '</div>'
            }
            return '<div class="lyrics-line">' + (line || '&nbsp;') + '</div>'
        }).join('')
    }

    document.getElementById('view-tags').innerHTML = s.tags.map(t => '<span class="tag tag-zinc">' + esc(t) + '</span>').join('') + getSongNoteHtml(s);

    const isRepSong = isSongInAnyRepertorio(s.sourceId || s.id);
    const editBtn = document.querySelector('#page-view .btn-icon[title="Editar"]');
    if (editBtn) editBtn.style.display = (!canEditRepSongs() && isRepSong) ? 'none' : '';
}

function changeKey(delta) {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    const currentIdx = NOTE_MAP[s.currentKey] ?? 0;
    const newIdx = (currentIdx + delta + 12) % 12;
    s.currentKey = useFlats ? FLATS[newIdx] : SHARPS[newIdx];
    save('cb_songs', songs);
    renderView()
}

function resetKey() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    s.currentKey = s.originalKey;
    save('cb_songs', songs);
    renderView()
}

function exportSong() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    dlJson({ type: 'chordbook-song', version: 2, id: s.id, audio_url: s.audio_url || null, songs: [{ id: s.id, title: s.title, artist: s.artist, lyrics: s.lyrics, originalKey: s.originalKey, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags, audio_url: s.audio_url || null }] }, s.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json')
}

function shareSong() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    const data = { type: 'chordbook-song', version: 2, id: s.id, audio_url: s.audio_url || null, songs: [{ id: s.id, title: s.title, artist: s.artist, lyrics: s.lyrics, originalKey: s.originalKey, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags, audio_url: s.audio_url || null, createdBy: s.createdBy || '', createdAt: s.createdAt || Date.now() }] };
    const text = JSON.stringify(data);
    if (navigator.share) {
        navigator.share({ title: s.title + ' - ChordBook', text: '🎵 ' + s.title + ' - ' + s.artist