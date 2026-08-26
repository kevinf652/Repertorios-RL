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
function getR2DeleteUrl(path) {
    if (!path) return '';
    // Si ya es una URL completa, extraer la ruta
    let cleanPath = path;
    if (path.includes('supabase.co')) {
        const match = path.match(/\/storage\/v1\/object\/public\/([^?]+)/);
        if (match) cleanPath = match[1];
    }
    
    // Dividir en carpeta y archivo
    const lastSlash = cleanPath.lastIndexOf('/');
    if (lastSlash === -1) {
        // No tiene carpeta, asumir "songs/"
        return R2_WORKER_URL + '/file/songs/' + encodeURIComponent(cleanPath);
    }
    
    const folder = cleanPath.substring(0, lastSlash);
    const filename = cleanPath.substring(lastSlash + 1);
    
    // Codificar solo el nombre del archivo, no la ruta
    return R2_WORKER_URL + '/file/' + folder + '/' + encodeURIComponent(filename);
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
let vocalAudioUploadPart = 'a';

// ============= AUTH SYSTEM =============
function isAdmin() { return userRole === 'admin' }
function isDMusicos() { return userRole === 'D_Musicos' }
function isDVoces() { return userRole === 'D_Voces' }
function isSubAdmin() { return userRole === 'SubAdmin' }
function canEditRepSongs() { return isAdmin() || isDMusicos() || isSubAdmin() }
function canEditVocals() { return isAdmin() || isDVoces() || isSubAdmin() }
function canUploadAudio() { return isAdmin() || isSubAdmin() }
function canManageReps() { return isAdmin() || isSubAdmin() }

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
    // Mismo formateo de acordes/secciones que usa la vista normal de canción
    // (chords resaltados, secciones entre paréntesis marcadas), solo que aquí
    // sin transposición ni notas vocales, por ser una vista previa de solo lectura.
    const lyricsHtml = (preview.lyrics || '').split('\n').map(line => {
        if (/\[[^\]]+\]/.test(line)) {
            let h = '<div class="lyrics-line">' + line.replace(/\[([^\]]+)\]/g, (m, p1) => '<span class="chord">' + displayChord(p1) + '</span>');
            h = h.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
            h = h.replace(/\s*\{\d+\}/g, '');
            return h + '</div>'
        }
        if (/\([^)]+\)/.test(line)) {
            const dl = line.replace(/\s*\{\d+\}/g, '');
            return '<div class="lyrics-line">' + dl.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>') + '</div>'
        }
        return '<div class="lyrics-line">' + (line || '&nbsp;') + '</div>'
    }).join('');
    modal.innerHTML = '<div style="background:#18181b;border-radius:16px 16px 0 0;max-height:85vh;width:100%;max-width:560px;overflow-y:auto;padding:18px 18px 20px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:10px">'
        + '<div style="min-width:0"><div style="font-size:1.05rem;font-weight:700;color:#fff">' + esc(preview.title || 'Sin título') + '</div>'
        + '<div style="font-size:.8rem;color:#a1a1aa">' + esc(preview.artist || 'Desconocido') + (preview.createdBy ? ' · Creado por ' + esc(preview.createdBy) : '') + '</div></div>'
        + '<button onclick="document.getElementById(\'cloud-preview-modal\').remove()" style="background:none;border:none;color:#a1a1aa;font-size:1.4rem;line-height:1;padding:4px;flex-shrink:0">×</button></div>'
        + '<div style="display:flex;gap:8px;margin:6px 0 12px;flex-wrap:wrap">' + (preview.originalKey ? '<span class="tag tag-key">' + dn(preview.originalKey) + '</span>' : '') + (preview.tempo ? '<span class="tag tag-zinc">' + preview.tempo + ' BPM</span>' : '') + (preview.compas ? '<span class="tag tag-zinc">' + esc(preview.compas) + '</span>' : '') + '</div>'
        + '<div style="font-size:.65rem;color:#71717a;margin-bottom:10px">👁 Vista previa — esta canción aún no está en tu biblioteca</div>'
        + '<div class="lyrics-container" style="margin-bottom:18px">' + (lyricsHtml || '<div class="lyrics-line">(Sin letra)</div>') + '</div>'
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
let _userSongsChannelActive = false;
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

    // Refresca la biblioteca personal cuando otra persona (o el propio usuario
    // desde otro dispositivo) edita una canción que también tienes guardada —
    // sin esto, solo se veía al recargar la página o volver a iniciar sesión.
    if (currentUser && currentUser.id && !_userSongsChannelActive) {
        _userSongsChannelActive = true;
        supabaseClient.channel('user-songs-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_songs', filter: 'user_id=eq.' + currentUser.id }, function(payload) {
                console.log('Realtime user_songs change:', payload.eventType);
                loadSongsFromCloud().then(function(cloudSongs) {
                    if (cloudSongs) {
                        songs = cloudSongs;
                        if (document.getElementById('page-library')?.classList.contains('active')) renderLibrary();
                        if (viewingSongId) renderView();
                    }
                });
            })
            .subscribe();
    }

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
            repAdmin = (userRole === 'admin' || userRole === 'SubAdmin');
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
        await supabaseClient.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', data.id);
        currentUser = { id: data.id, nombre: data.nombre || '', apellido: data.apellido || '', role: data.role || 'usuario' };
        localStorage.setItem('rl_current_user', JSON.stringify(currentUser));
        userRole = currentUser.role;
        repAdmin = (userRole === 'admin' || userRole === 'SubAdmin');
        if (userRole === 'admin') localStorage.setItem('cb_rep_admin', 'true');
        updateUserUI();
        closeAuthModal();
        setupRealtimeSubscriptions();

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
        // ✅ FORZAR role = 'usuario' siempre al registrarse
        const { error } = await supabaseClient.from('admin_users').insert({ 
            id: username.toLowerCase(), 
            nombre: nombre, 
            apellido: apellido, 
            password_hash: password, 
            role: 'usuario',  // <-- SIEMPRE usuario
            created_at: Date.now() 
        });
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

        // ✅ Deduplicar registros: agrupar por source_song_id + coro_number + dia y eliminar extras
        try {
            const seen = {};
            const duplicateIds = [];
            for (const va of vocalAudios) {
                const key = (va.source_song_id || '') + '|' + (va.coro_number || '') + '|' + (va.dia || '') + '|' + (va.part || 'a');
                if (seen[key]) {
                    duplicateIds.push(va.id);
                } else {
                    seen[key] = true;
                }
            }
            if (duplicateIds.length > 0) {
                console.log('🧹 Eliminando', duplicateIds.length, 'registros duplicados de vocal_audios');
                await supabaseClient.from('vocal_audios').delete().in('id', duplicateIds);
                vocalAudios = vocalAudios.filter(va => !duplicateIds.includes(va.id));
            }
        } catch (dedupErr) {
            console.warn('⚠️ Error deduplicando vocal_audios:', dedupErr.message);
        }

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
                        if (!repVocalAudios.find(x => x.source_song_id === va.source_song_id && x.coro_number === va.coro_number && x.dia === va.dia && (x.part || 'a') === (va.part || 'a'))) {
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

// ============= VIEW AUDIO FUNCTIONS =============
function toggleViewAudio() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s || !s.audio_url) return;
    const audioUrl = normalizeVocalAudioUrl(s.audio_url);
    
    if (!viewAudioEl) {
        viewAudioEl = new Audio();
        viewAudioEl.crossOrigin = 'anonymous';
        viewAudioEl.preload = 'auto';
        
        viewAudioEl.addEventListener('loadedmetadata', function() {
            const dur = document.getElementById('view-audio-duration');
            if (dur) dur.textContent = formatTime(this.duration);
            // Actualizar barra después de cargar
            updateViewAudioProgress();
        });
        
        viewAudioEl.addEventListener('timeupdate', function() {
            updateViewAudioProgress();
        });
        
        viewAudioEl.addEventListener('ended', function() {
            viewAudioPlaying = false;
            updateViewAudioBtn();
        });
        
        viewAudioEl.addEventListener('error', function() {
            console.error('Audio error:', this.error);
            viewAudioPlaying = false;
            updateViewAudioBtn();
            showNotification('Error al cargar el audio', 'error');
        });
        
        viewAudioEl.src = audioUrl;
    }
    
    if (viewAudioPlaying) {
        viewAudioEl.pause();
        viewAudioPlaying = false;
    } else {
        viewAudioEl.play().catch(function(e) {
            console.error('Play error:', e);
            showNotification('Error al reproducir', 'error');
        });
        viewAudioPlaying = true;
    }
    updateViewAudioBtn();
}

function updateViewAudioProgress() {
    if (!viewAudioEl || !viewAudioEl.duration) return;
    const pct = (viewAudioEl.currentTime / viewAudioEl.duration) * 100;
    const fill = document.getElementById('view-audio-fill');
    if (fill) fill.style.width = Math.min(pct, 100) + '%';
    const cur = document.getElementById('view-audio-current');
    if (cur) cur.textContent = formatTime(viewAudioEl.currentTime);
}

function updateViewAudioBtn() {
    const icon = document.getElementById('view-audio-icon');
    if (!icon) return;
    if (viewAudioPlaying) {
        icon.outerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5" id="view-audio-icon"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else {
        icon.outerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg>';
    }
}

function seekViewAudio(e) {
    if (!viewAudioEl || !viewAudioEl.duration) {
        // Si el audio no está listo, esperar a que se cargue
        if (viewAudioEl) {
            viewAudioEl.addEventListener('loadedmetadata', function() {
                seekViewAudio(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * viewAudioEl.duration;
    if (isFinite(newTime) && newTime >= 0) {
        viewAudioEl.currentTime = newTime;
        const fill = document.getElementById('view-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('view-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
}

function seekViewAudioTouch(e) {
    e.preventDefault();
    if (!viewAudioEl || !viewAudioEl.duration) {
        if (viewAudioEl) {
            viewAudioEl.addEventListener('loadedmetadata', function() {
                seekViewAudioTouch(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const x = (touch.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * viewAudioEl.duration;
    if (isFinite(newTime) && newTime >= 0) {
        viewAudioEl.currentTime = newTime;
        const fill = document.getElementById('view-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('view-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
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
        
        repAudioEl.addEventListener('loadedmetadata', function() {
            const dur = document.getElementById('rep-audio-duration');
            if (dur) dur.textContent = formatTime(this.duration);
            updateRepAudioProgress();
        });
        
        repAudioEl.addEventListener('timeupdate', function() {
            updateRepAudioProgress();
        });
        
        repAudioEl.addEventListener('ended', function() {
            repAudioPlaying = false;
            updateAudioBtn();
        });
        
        repAudioEl.addEventListener('error', function() {
            console.error('Rep audio error:', this.error);
            repAudioPlaying = false;
            updateAudioBtn();
            showNotification('Error al cargar el audio', 'error');
        });
        
        repAudioEl.src = audioUrl;
    }
    
    if (repAudioPlaying) {
        repAudioEl.pause();
        repAudioPlaying = false;
    } else {
        repAudioEl.play().catch(function(e) {
            console.error('Play error:', e);
            showNotification('Error al reproducir', 'error');
        });
        repAudioPlaying = true;
    }
    updateAudioBtn();
}

function updateRepAudioProgress() {
    if (!repAudioEl || !repAudioEl.duration) return;
    const pct = (repAudioEl.currentTime / repAudioEl.duration) * 100;
    const fill = document.getElementById('rep-audio-fill');
    if (fill) fill.style.width = Math.min(pct, 100) + '%';
    const cur = document.getElementById('rep-audio-current');
    if (cur) cur.textContent = formatTime(repAudioEl.currentTime);
}

function updateAudioBtn() {
    const btn = document.querySelector('.audio-play-btn');
    if (!btn) return;
    if (repAudioPlaying) {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg>';
    }
}

function seekRepAudio(e) {
    if (!repAudioEl || !repAudioEl.duration) {
        if (repAudioEl) {
            repAudioEl.addEventListener('loadedmetadata', function() {
                seekRepAudio(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * repAudioEl.duration;
    if (isFinite(newTime) && newTime >= 0) {
        repAudioEl.currentTime = newTime;
        const fill = document.getElementById('rep-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('rep-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
}

function seekRepAudioTouch(e) {
    e.preventDefault();
    if (!repAudioEl || !repAudioEl.duration) {
        if (repAudioEl) {
            repAudioEl.addEventListener('loadedmetadata', function() {
                seekRepAudioTouch(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const x = (touch.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * repAudioEl.duration;
    if (isFinite(newTime) && newTime >= 0) {
        repAudioEl.currentTime = newTime;
        const fill = document.getElementById('rep-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('rep-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
}

// ============= VOCAL AUDIO FUNCTIONS =============
function stopVocalAudioProgress() {
    if (vocalAudioInterval) { clearInterval(vocalAudioInterval);
        vocalAudioInterval = null }
}

function startVocalAudioProgress() {
    stopVocalAudioProgress();
    vocalAudioInterval = setInterval(function() {
        updateVocalAudioProgress(vocalAudioCurrentKey);
    }, 250);
}

function setupVocalAudioProgress(audio, key) {
    audio.addEventListener('loadedmetadata', function() {
        updateVocalAudioProgress(key);
    });
    audio.addEventListener('timeupdate', function() {
        updateVocalAudioProgress(key);
    });
}

function updateVocalAudioProgress(key) {
    const audio = vocalAudioPlayers[key];
    if (!audio || !audio.duration) return;
    if (vocalAudioCurrentKey !== key) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    const fill = document.getElementById('vocal-audio-fill');
    if (fill) fill.style.width = Math.min(pct, 100) + '%';
    const cur = document.getElementById('vocal-audio-current');
    if (cur) cur.textContent = formatTime(audio.currentTime);
    const dur = document.getElementById('vocal-audio-duration');
    if (dur) dur.textContent = formatTime(audio.duration);
}

function seekVocalAudio(e) {
    const audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio || !audio.duration) {
        if (audio) {
            audio.addEventListener('loadedmetadata', function() {
                seekVocalAudio(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * audio.duration;
    if (isFinite(newTime) && newTime >= 0) {
        audio.currentTime = newTime;
        const fill = document.getElementById('vocal-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('vocal-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
}

function seekVocalAudioTouch(e) {
    e.preventDefault();
    const audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio || !audio.duration) {
        if (audio) {
            audio.addEventListener('loadedmetadata', function() {
                seekVocalAudioTouch(e);
            }, { once: true });
        }
        return;
    }
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;
    const x = (touch.clientX - rect.left) / rect.width;
    const pct = Math.max(0, Math.min(1, x));
    const newTime = pct * audio.duration;
    if (isFinite(newTime) && newTime >= 0) {
        audio.currentTime = newTime;
        const fill = document.getElementById('vocal-audio-fill');
        if (fill) fill.style.width = (pct * 100) + '%';
        const cur = document.getElementById('vocal-audio-current');
        if (cur) cur.textContent = formatTime(newTime);
    }
}

function updateVocalAudioButtons() {
    document.querySelectorAll('[data-vocal-key]').forEach(function(btn) {
        var key = btn.getAttribute('data-vocal-key');
        if (vocalAudioCurrentKey === key && vocalAudioPlayers[key] && !vocalAudioPlayers[key].paused) {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            btn.style.color = '#f59e0b';
        } else if (vocalAudioCurrentKey === key && vocalAudioPlayers[key]) {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            btn.style.color = '#f59e0b';
        } else {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
            btn.style.color = '#4ade80';
        }
    });
    updateVocalAudioPlayerBar();
}

function updateVocalAudioPlayerBar() {
    var bar = document.getElementById('vocal-audio-player-bar');
    if (!bar) return;
    if (vocalAudioCurrentKey && vocalAudioPlayers[vocalAudioCurrentKey]) {
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
    }
}

function toggleVocalAudioFromBar() {
    var audio = vocalAudioPlayers[vocalAudioCurrentKey];
    if (!audio) return;
    if (!audio.paused) {
        audio.pause();
        updateVocalAudioButtons();
    } else {
        audio.play().catch(function(e) { console.error(e) });
        updateVocalAudioButtons();
    }
}

function playVocalAudio(key, url) {
    url = normalizeVocalAudioUrl(url);
    
    if (vocalAudioCurrentKey === key && vocalAudioPlayers[key]) {
        if (!vocalAudioPlayers[key].paused) {
            vocalAudioPlayers[key].pause();
            updateVocalAudioButtons();
            return true;
        } else {
            vocalAudioPlayers[key].play().catch(function(e) { console.error('Resume error:', e) });
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
    
    if (repAudioEl) {
        repAudioEl.pause();
        repAudioPlaying = false;
        updateAudioBtn();
    }
    if (viewAudioEl) {
        viewAudioEl.pause();
        viewAudioPlaying = false;
        updateViewAudioBtn();
    }
    
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    
    audio.addEventListener('error', function() {
        console.error('Vocal audio error:', this.error);
        showNotification('Error al cargar audio vocal', 'error');
    });
    
    audio.addEventListener('ended', function() {
        delete vocalAudioPlayers[key];
        if (vocalAudioCurrentKey === key) {
            vocalAudioCurrentKey = null;
        }
        updateVocalAudioButtons();
    });
    
    setupVocalAudioProgress(audio, key);
    audio.src = url;
    vocalAudioPlayers[key] = audio;
    vocalAudioCurrentKey = key;
    
    audio.play().then(function() {
        console.log('Playing vocal audio');
        updateVocalAudioButtons();
    }).catch(function(e) {
        console.error('Play error:', e);
        delete vocalAudioPlayers[key];
        vocalAudioCurrentKey = null;
        showNotification('No se pudo reproducir el audio vocal', 'error');
    });
    return true;
}

// Elimina estas funciones si existen:
// startViewAudioProgress, stopViewAudioProgress, startAudioProgress, stopAudioProgress, startVocalAudioProgress, stopVocalAudioProgress

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
            try { 
                const storedKey = extractR2Key(songs[si].audio_url);
                pathsToDelete.add(storedKey);
            } catch (e) {}
        }
        try {
            const { data: repSongs } = await supabaseClient.from('canciones_repertorio').select('audio_url').eq('source_song_id', songId);
            if (repSongs) {
                repSongs.forEach(rs => { 
                    if (rs.audio_url) { 
                        try { 
                            const p = extractR2Key(rs.audio_url);
                            pathsToDelete.add(p);
                        } catch (e) {} 
                    } 
                });
            }
        } catch (e) {}
        try {
            const { data: userSongs } = await supabaseClient.from('user_songs').select('song_data');
            if (userSongs) {
                for (const us of userSongs) {
                    try {
                        const sd = typeof us.song_data === 'string' ? JSON.parse(us.song_data) : us.song_data;
                        if (sd && (sd.id === songId || (sd.sourceId && sd.sourceId === songId))) {
                            if (sd.audio_url) { 
                                const p = extractR2Key(sd.audio_url);
                                pathsToDelete.add(p);
                            }
                        }
                    } catch (parseErr) {}
                }
            }
        } catch (e) {}

        for (const delPath of pathsToDelete) {
            try { 
                // ✅ Usar getR2DeleteUrl en lugar de encodeURIComponent
                const deleteUrl = getR2DeleteUrl(delPath);
                await fetch(deleteUrl, { method: 'DELETE' });
                console.log('✅ Audio anterior eliminado:', delPath);
            } catch (e) {
                console.warn('⚠️ No se pudo eliminar archivo anterior:', delPath, e.message);
            }
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
logActivity('audio_uploaded', {
    type: 'song',
    fileSize: file.size,
    songTitle: songTitle
}, 'song', songId);
}

function triggerAudioUpload(songId) { audioUploadSongId = songId;
    document.getElementById('audio-upload-input').click() }

async function removeSongAudio(songId) {
    if (!confirm('¿Eliminar el audio vinculado a esta canción?')) return;
    const si = songs.findIndex(s => s.id === songId);
    if (si === -1) return;
    const s = songs[si];

    // --- Eliminar de R2 correctamente ---
    if (s.audio_url) {
        try {
            let path = s.audio_url;
            // Si es URL de Supabase, extrae la ruta
            if (path.includes('supabase.co')) {
                const match = path.match(/\/storage\/v1\/object\/public\/([^?]+)/);
                if (match) path = match[1];
            } else {
                path = extractR2Key(path);
            }
            
            // Usar la función helper para construir la URL correcta
            const deleteUrl = getR2DeleteUrl(path);
            console.log('📤 Eliminando audio de canción:', deleteUrl);
            
            const response = await fetch(deleteUrl, { method: 'DELETE' });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.warn('⚠️ No se pudo eliminar de R2:', response.status, errorText);
            } else {
                console.log('✅ Audio de canción eliminado de R2:', path);
            }
        } catch (e) {
            console.warn('⚠️ Error eliminando audio de canción:', e.message);
        }
    }

    // Limpiar en la base de datos local
    songs[si].audio_url = null;
    save('cb_songs', songs);

    // Limpiar en Supabase
    try {
        await supabaseClient.from('canciones_repertorio').update({ audio_url: null }).eq('source_song_id', songId);
        
        const { data: userSongs } = await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
        if (userSongs) {
            for (const us of userSongs) {
                try {
                    const sd = typeof us.song_data === 'string' ? JSON.parse(us.song_data) : us.song_data;
                    if (sd && (sd.id === songId || (sd.sourceId && sd.sourceId === songId))) {
                        sd.audio_url = null;
                        await supabaseClient.from('user_songs').update({ 
                            song_data: JSON.stringify(sd), 
                            updated_at: Date.now() 
                        }).eq('id', us.id);
                    }
                } catch (parseErr) {}
            }
        }
    } catch (e) {
        console.log('Supabase update skipped:', e.message);
    }

    try { await loadRepertorios() } catch (e) { console.log("Reload repertorios error:", e.message) }
    
    if (viewingSongId === songId) { renderView() } else { renderLibrary() }
    if (viewingRepId) { renderRepertorioView() }
    
    showNotif('import-notification', 'Audio desvinculado de "' + s.title + '"', 'success');
    logActivity('audio_deleted', {
        type: 'song',
        songTitle: s.title
    }, 'song', songId);
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
       // const pv = s.lyrics.split('\n').slice(0, 3).join(' / '); //
        const il = lists.filter(l => l.songIds.includes(s.id)).length;
        return '<div class="card" onclick="viewSong(\'' + s.id + '\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1;min-width:0"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ' + esc(s.title) + (!canEditRepSongs() && isSongInAnyRepertorio(s.sourceId || s.id) ? ' 🔒' : '') + '</div><div class="card-artist">' + esc(s.artist) + '</div><div class="card-meta"><span class="tag tag-key">' + dn(s.originalKey) + '</span>' + (s.tempo ? '<span class="tag tag-zinc">' + s.tempo + ' BPM</span>' : '') + (s.compas ? '<span class="tag tag-zinc">' + s.compas + '</span>' : '') + s.tags.slice(0, 2).map(t => '<span class="tag tag-zinc">' + esc(t) + '</span>').join('') + (il > 0 ? '<span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> ' + il + '</span>' : '') + (s.audio_url ? '<span class="tag" style="background:rgba(34,197,94,.2);color:#4ade80">🎵 Audio</span>' : '') + '</div></div><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' + (canUploadAudio() ? '<button class="btn-icon" onclick="event.stopPropagation();triggerAudioUpload(\'' + s.id + '\')" data-audio-upload="' + s.id + '" title="' + (s.audio_url ? 'Cambiar audio' : 'Subir audio') + '" style="color:' + (s.audio_url ? '#4ade80' : '#71717a') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>' : '') + '<button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteSong(\'' + s.id + '\')" title="Eliminar de biblioteca" style="flex-shrink:0;align-self:flex-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' + '</div></div></div>';
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
    logActivity('song_updated', { 
        title: t, 
        artist: a, 
        originalKey: formKey,
        tempo: bpm,
        compas: cmp
    }, 'song', editingSongId);
        }
    } else {
        var dk = detectKey(l);
        var creatorName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
        songs.unshift({ id: genId(), title: t, artist: a, lyrics: l, originalKey: formKey || dk, currentKey: formKey || dk, tags: [...formTags], tempo: bpm, compas: cmp, audio_url: null, createdAt: Date.now(), updatedAt: Date.now(), createdBy: creatorName || '' })

logActivity('song_created', { 
    title: t, 
    artist: a, 
    originalKey: formKey || dk,
    tempo: bpm,
    compas: cmp
}, 'song', songs[0].id);
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
    logActivity('song_deleted', {
        title: s ? s.title : '',
        artist: s ? s.artist : ''
    }, 'song', songId);
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
    logActivity('song_deleted', {
        title: s ? s.title : '',
        artist: s ? s.artist : ''
    }, 'song', songId);
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

    // En app.js, en la función renderView(), reemplaza la sección del audio:
const audioSection = document.getElementById('view-audio-section');
if (s.audio_url) {
    audioSection.innerHTML = '<div class="audio-player" id="view-audio-player"><button class="audio-play-btn" onclick="toggleViewAudio()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekViewAudio(event)" ontouchstart="seekViewAudioTouch(event)" ontouchmove="seekViewAudioTouch(event)" style="touch-action:none"><div class="audio-bar-fill" id="view-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="view-audio-current">0:00</span><span id="view-audio-duration">--:--</span></div></div>' + (canUploadAudio() ? '<button class="btn-icon" onclick="triggerAudioUpload(\'' + s.id + '\')" title="Cambiar audio" style="color:#71717a"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button><button class="btn-icon btn-icon-red" onclick="removeSongAudio(\'' + s.id + '\')" title="Eliminar audio" style="color:#f87171"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') + '</div>';
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
        navigator.share({ title: s.title + ' - ChordBook', text: '🎵 ' + s.title + ' - ' + s.artist }).then(() => { dlJson(data, s.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json') }).catch(() => { dlJson(data, s.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json') })
    } else {
        navigator.clipboard.writeText(text).then(() => { showNotif('import-notification', 'JSON copiado. Pégalo donde quieras para compartir.', 'success') }).catch(() => { dlJson(data, s.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json') })
    }
}

function dlJson(d, f) {
    const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }),
        u = URL.createObjectURL(b),
        a = document.createElement('a');
    a.href = u;
    a.download = f;
    a.click();
    URL.revokeObjectURL(u)
}

// ============= LIST FUNCTIONS =============
function renderLists() {
    document.getElementById('list-count').textContent = lists.length + ' listas';
    const c = document.getElementById('list-list');
    if (lists.length === 0) {
        c.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div><h2>Sin listas aún</h2><p>Crea listas para organizar tus canciones</p><button class="btn btn-amber" onclick="showNewListForm()">Crear primera lista</button></div>';
        return
    }
    c.innerHTML = lists.map(l => {
        const sc = l.songIds.length;
        return '<div class="card" onclick="viewList(\'' + l.id + '\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><div style="flex:1"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> ' + esc(l.name) + '</div>' + (l.description ? '<p style="font-size:.7rem;color:#71717a;margin-left:20px">' + esc(l.description) + '</p>' : '') + '<div style="display:flex;gap:6px;margin-top:6px;margin-left:20px"><span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ' + sc + ' canciones</span></div></div><div style="display:flex;gap:2px"><button class="btn-icon" onclick="event.stopPropagation();shareList(\'' + l.id + '\')" title="Exportar / Compartir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteList(\'' + l.id + '\')" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div></div>';
    }).join('');
}

function showNewListForm() {
    document.getElementById('new-list-form').classList.remove('hidden');
    document.getElementById('input-list-name').focus()
}

function hideNewListForm() {
    document.getElementById('new-list-form').classList.add('hidden');
    document.getElementById('input-list-name').value = '';
    document.getElementById('input-list-desc').value = ''
}

function createList() {
    const n = document.getElementById('input-list-name').value.trim();
    if (!n) return;
    lists.unshift({ id: genId(), name: n, description: document.getElementById('input-list-desc').value.trim(), songIds: [], createdAt: Date.now(), updatedAt: Date.now() });
    save('cb_lists', lists);
    hideNewListForm();
    renderLists()
}

function confirmDeleteList(id) {
    if (confirm('¿Eliminar esta lista?')) { lists = lists.filter(l => l.id !== id);
        save('cb_lists', lists);
        renderLists() }
}

function exportList(id) {
    const l = lists.find(x => x.id === id);
    if (!l) return;
    const ls = songs.filter(s => l.songIds.includes(s.id));
    dlJson({ type: 'chordbook-list', version: 2, list: { name: l.name, description: l.description, songIds: l.songIds }, songs: ls.map(s => ({ id: s.id, title: s.title, artist: s.artist, lyrics: s.lyrics, originalKey: s.originalKey, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags, audio_url: s.audio_url || null, createdBy: s.createdBy || '', createdAt: s.createdAt || Date.now() })) }, 'lista-' + l.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json')
}

function exportCurrentList() { exportList(viewingListId) }

function shareList(id) {
    const l = lists.find(x => x.id === id);
    if (!l) return;
    const ls = songs.filter(s => l.songIds.includes(s.id));
    const data = { type: 'chordbook-list', version: 2, list: { name: l.name, description: l.description, songIds: l.songIds }, songs: ls.map(s => ({ id: s.id, title: s.title, artist: s.artist, lyrics: s.lyrics, originalKey: s.originalKey, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags, audio_url: s.audio_url || null, createdBy: s.createdBy || '', createdAt: s.createdAt || Date.now() })) };
    const text = JSON.stringify(data);
    const fname = 'lista-' + l.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
    if (navigator.share) {
        navigator.share({ title: l.name + ' - ChordBook', text: '📋 Lista: ' + l.name + ' (' + ls.length + ' canciones)' }).then(() => { dlJson(data, fname) }).catch(() => { dlJson(data, fname) })
    } else {
        navigator.clipboard.writeText(text).then(() => { showNotif('import-list-notification', 'JSON de lista copiado. Pégalo donde quieras.', 'success') }).catch(() => { dlJson(data, fname) })
    }
}

function shareCurrentList() { shareList(viewingListId) }

function viewList(id) { viewingListId = id;
    listNavIndex = 0;
    showPage('listview') }

function renderListView() {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) return;

    // Show pending import banner if the list has pending songs
    if (l.pendingImport) {
        const banner = document.getElementById('pending-import-banner');
        if (!banner) {
            const container = document.getElementById('listview-songs');
            if (container) {
                const b = document.createElement('div');
                b.id = 'pending-import-banner';
                b.style.cssText = 'margin-bottom:12px;padding:10px 14px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:.8rem;color:#fbbf24;display:flex;align-items:center;gap:10px';
                b.innerHTML = '<span style="font-size:20px">📋</span><span>Esta lista tiene canciones que no están en tu biblioteca. <strong>Puedes añadirlas una por una</strong> usando los botones de abajo.</span>';
                container.parentNode.insertBefore(b, container);
            }
        }
    } else {
        const banner = document.getElementById('pending-import-banner');
        if (banner) banner.remove();
    }

    const listSongs = l.songIds.map(sid => songs.find(s => s.id === sid)).filter(Boolean);
    const missingSongs = l.songIds.filter(sid => !songs.find(s => s.id === sid));

    document.getElementById('listview-header').innerHTML = '<div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;background:rgba(245,158,11,.2);border-radius:10px;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><div><h1 style="font-size:1.1rem;font-weight:700;color:#fff">' + esc(l.name) + '</h1>' + (l.description ? '<p style="font-size:.7rem;color:#71717a">' + esc(l.description) + '</p>' : '') + '<p style="font-size:.7rem;color:#71717a">' + listSongs.length + ' canciones</p></div></div>';

    const mc = document.getElementById('listview-missing');
    if (missingSongs.length > 0) {
        resolveMissingListSongs(missingSongs);
        mc.innerHTML = '<div class="missing-songs"><div class="missing-songs-title">⚠ ' + missingSongs.length + ' canciones no están en tu biblioteca</div>' + missingSongs.map(sid => {
            const preview = cloudSongPreviewCache[sid];
            if (preview === undefined) {
                return '<div class="missing-song-item"><span>Buscando canción...</span></div>';
            } else if (preview) {
                return '<div class="missing-song-item"><span>' + esc(preview.title || 'Sin título') + ' — ' + esc(preview.artist || 'Desconocido') + (preview.createdBy ? ' <span style="color:#71717a">(Creado por ' + esc(preview.createdBy) + ')</span>' : '') + '</span><div style="display:flex;gap:6px"><button class="missing-song-add" style="background:transparent;border:1px solid #f59e0b;color:#f59e0b" onclick="showCloudSongPreviewModal(\'' + sid + '\')">Ver</button><button class="missing-song-add" onclick="addCloudSongToLibraryFromList(\'' + l.id + '\',\'' + sid + '\')">Añadir a mi biblioteca</button></div></div>';
            } else {
                return '<div class="missing-song-item"><span>Canción no encontrada (nadie la tiene guardada)</span></div>';
            }
        }).join('') + '</div>';
    } else { mc.innerHTML = '' }

    const container = document.getElementById('listview-songs');
    if (listSongs.length === 0) {
        container.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>Lista vacía</h2><p>Añade canciones desde la biblioteca</p><button class="btn btn-amber" onclick="showPage(\'library\')">Ir a biblioteca</button></div>';
        return
    }
    container.innerHTML = listSongs.map(s => {
        const pv = s.lyrics.split('\n').slice(0, 3).join(' / ');
        return '<div class="card" onclick="viewSongFromList(\'' + s.id + '\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1;min-width:0"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ' + esc(s.title) + '</div><div class="card-artist">' + esc(s.artist) + '</div><div class="card-preview">' + esc(pv) + '</div><div class="card-meta"><span class="tag tag-key">' + dn(s.originalKey) + '</span>' + s.tags.slice(0, 2).map(t => '<span class="tag tag-zinc">' + esc(t) + '</span>').join('') + '</div></div><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();removeFromList(\'' + s.id + '\')" title="Quitar" style="align-self:flex-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>';
    }).join('');
}

function listNav(dir) {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) return;
    const listSongs = l.songIds.map(sid => songs.find(s => s.id === sid)).filter(Boolean);
    const newIdx = listNavIndex + dir;
    if (newIdx >= 0 && newIdx < listSongs.length) { listNavIndex = newIdx;
        viewingSongId = listSongs[newIdx].id;
        viewReturnTo = 'listview';
        showPage('view') }
}

function viewNav(dir) { listNav(dir) }

function viewSongFromList(id) {
    const l = lists.find(x => x.id === viewingListId);
    if (l) { listNavIndex = l.songIds.indexOf(id); if (listNavIndex === -1) listNavIndex = 0 }
    viewingSongId = id;
    viewReturnTo = 'listview';
    showPage('view')
}

function removeFromList(sid) {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) return;
    l.songIds = l.songIds.filter(id => id !== sid);
    save('cb_lists', lists);
    renderListView()
}

function toggleListPicker() {
    document.getElementById('view-list-picker').classList.toggle('hidden');
    renderListPicker()
}

function renderListPicker() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    const p = document.getElementById('view-list-picker');
    if (lists.length === 0) { p.innerHTML = '<div class="list-picker-title">No hay listas creadas</div>'; return }
    p.innerHTML = '<div class="list-picker-title">Añadir a lista:</div><div style="display:flex;flex-wrap:wrap;gap:6px">' + lists.map(l => {
        const isIn = l.songIds.includes(s.id);
        return '<button class="list-chip ' + (isIn ? 'in' : 'out') + '" onclick="toggleSongInList(\'' + l.id + '\')">' + (isIn ? '✓ ' : '') + esc(l.name) + '</button>'
    }).join('') + '</div>'
}

function toggleSongInList(lid) {
    const l = lists.find(x => x.id === lid),
        s = songs.find(x => x.id === viewingSongId);
    if (!l || !s) return;
    if (l.songIds.includes(s.id)) { l.songIds = l.songIds.filter(id => id !== s.id) } else { l.songIds.push(s.id) }
    save('cb_lists', lists);
    renderListPicker();
    renderView()
}

// ============= CLOUD SONG RESOLVE FUNCTIONS =============
async function resolveMissingListSongs(ids) {
    const toFetch = ids.filter(id => cloudSongPreviewCache[id] === undefined);
    if (toFetch.length === 0) return;
    if (!supabaseReady) { toFetch.forEach(id => cloudSongPreviewCache[id] = null);
        renderListView(); return }
    try {
        const { data: matches, error } = await supabaseClient.from('user_songs').select('song_data').limit(10000);
        const byId = {};
        if (!error && matches) {
            matches.forEach(m => {
                try {
                    const sd = typeof m.song_data === 'string' ? JSON.parse(m.song_data) : m.song_data;
                    if (sd && sd.id && !byId[sd.id]) byId[sd.id] = sd;
                } catch (e) {}
            });
        }
        toFetch.forEach(id => { cloudSongPreviewCache[id] = byId[id] || null });
    } catch (e) { console.error('resolveMissingListSongs error:', e);
        toFetch.forEach(id => cloudSongPreviewCache[id] = null) }
    renderListView();
}

function addCloudSongToLibraryFromList(listId, songId) {
    const preview = cloudSongPreviewCache[songId];
    if (!preview) { alert('No se pudo obtener esta canción.'); return }
    const existing = songs.find(x => x.id === songId);
    if (!existing) {
        songs.push({
            id: songId,
            sourceId: preview.sourceId || songId,
            sourceType: 'lista',
            title: preview.title || 'Sin título',
            artist: preview.artist || 'Desconocido',
            lyrics: preview.lyrics || '',
            originalKey: preview.originalKey || 'C',
            currentKey: preview.originalKey || 'C',
            tags: preview.tags || [],
            tempo: preview.tempo || 0,
            compas: preview.compas || '',
            audio_url: preview.audio_url || null,
            createdAt: preview.createdAt || Date.now(),
            updatedAt: Date.now(),
            createdBy: preview.createdBy || ''
        });
        save('cb_songs', songs);
        if (currentUser && supabaseReady) { syncSongsToCloud() }
    }
    renderListView();
}

// ============= IMPORT FUNCTIONS =============
document.getElementById('import-input').addEventListener('change', async function(e) {
    const files = e.target.files;
    if (!files || !files.length) return;
    let total = 0;
    for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop().toLowerCase(),
            content = await file.text();
        if (ext === 'json') {
            try {
                const d = JSON.parse(content);
                if (d.type === 'chordbook-song' && Array.isArray(d.songs)) {
                    d.songs.forEach(s => {
                        const songId = s.id || d.id || genId();
                        const existing = songs.find(x => x.id === songId);
                        if (!existing) {
                            const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
                            songs.unshift({ id: songId, sourceId: s.id || d.id || null, sourceType: s.id ? 'imported' : undefined, title: s.title || 'Sin título', artist: s.artist || 'Desconocido', lyrics: s.lyrics || '', originalKey: dk, currentKey: dk, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags || [], audio_url: s.audio_url || d.audio_url || null, createdAt: s.createdAt || Date.now(), updatedAt: Date.now(), createdBy: s.createdBy || '' });
                            total++;
                        }
                    })
                }
                if (d.type === 'chordbook-list') { importListData(d) }
            } catch (e) {}
        } else if (ext === 'txt') {
            const parsed = parseSongFilename(file.name);
            const dk = parsed.key ? (NOTE_MAP[parsed.key] !== undefined ? dn(parsed.key) : parsed.key) : (detectKey(content));
            songs.unshift({ id: genId(), title: parsed.title, artist: parsed.artist, lyrics: content.trim(), originalKey: dk, currentKey: dk, tempo: parsed.bpm || 0, compas: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() });
            total++;
        }
    }
    save('cb_songs', songs);
    e.target.value = '';
    showNotif('import-notification', total + ' canciones importadas', 'success');
    renderLibrary();
    if (currentUser && supabaseReady) { syncSongsToCloud() }
});

// ============= IMPORT LIST (MEJORADO) =============
document.getElementById('import-list-input').addEventListener('change', async function(e) {
    const files = e.target.files;
    if (!files || !files.length) return;

    let imported = 0;
    let hasPending = false;

    for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'json') {
            try {
                const content = await file.text();
                const d = JSON.parse(content);

                if (d.type === 'chordbook-list') {
                    const listName = d.list?.name || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Lista importada';
                    const listDescription = d.list?.description || '';
                    const fileSongs = d.songs || [];

                    // 1️⃣ Detectar canciones nuevas
                    const newSongs = fileSongs.filter(s => {
                        const songId = s.id || genId();
                        return !songs.find(x => x.id === songId);
                    });

                    // 2️⃣ Si hay canciones nuevas, mostrar modal
                    if (newSongs.length > 0) {
                        showImportConfirmModal(
                            newSongs,
                            { name: listName, description: listDescription, id: d.list?.id },
                            fileSongs
                        );
                        imported++;
                        hasPending = true;
                    } else {
                        // 3️⃣ Si no hay canciones nuevas, crear lista directamente
                        const allSongIds = fileSongs.map(s => s.id || genId());
                        const existingList = lists.find(l => l.name === listName);

                        if (existingList) {
                            const newIds = allSongIds.filter(id => !existingList.songIds.includes(id));
                            existingList.songIds = [...existingList.songIds, ...newIds];
                            existingList.updatedAt = Date.now();
                            if (newIds.length > 0) {
                                showNotification(`📋 Lista "${listName}" actualizada (+${newIds.length} canciones)`, 'success');
                            } else {
                                showNotification(`📋 Lista "${listName}" ya estaba actualizada`, 'success');
                            }
                        } else {
                            lists.unshift({
                                id: genId(),
                                name: listName,
                                description: listDescription,
                                songIds: allSongIds,
                                createdAt: Date.now(),
                                updatedAt: Date.now()
                            });
                            showNotification(`📋 Lista "${listName}" creada (${allSongIds.length} canciones)`, 'success');
                        }
                        save('cb_lists', lists);
                        imported++;
                    }

                } else if (d.type === 'chordbook-song' && Array.isArray(d.songs)) {
                    const listName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Lista importada';
                    const fileSongs = d.songs || [];
                    const newSongs = fileSongs.filter(s => {
                        const songId = s.id || genId();
                        return !songs.find(x => x.id === songId);
                    });

                    if (newSongs.length > 0) {
                        showImportConfirmModal(
                            newSongs,
                            { name: listName, description: 'Importada desde canción' },
                            fileSongs
                        );
                        imported++;
                        hasPending = true;
                    } else {
                        const allSongIds = fileSongs.map(s => s.id || genId());
                        const existingList = lists.find(l => l.name === listName);

                        if (existingList) {
                            const newIds = allSongIds.filter(id => !existingList.songIds.includes(id));
                            existingList.songIds = [...existingList.songIds, ...newIds];
                            existingList.updatedAt = Date.now();
                        } else {
                            lists.unshift({
                                id: genId(),
                                name: listName,
                                description: 'Importada desde canción',
                                songIds: allSongIds,
                                createdAt: Date.now(),
                                updatedAt: Date.now()
                            });
                        }
                        save('cb_lists', lists);
                        imported++;
                    }
                }
            } catch (err) {
                console.error('Error importando archivo:', err);
                showNotification(`❌ Error al importar ${file.name}: ${err.message}`, 'error');
            }
        }
    }

    e.target.value = '';

    if (imported === 0 && !document.getElementById('import-confirm-modal')) {
        showNotification('No se encontraron archivos válidos para importar', 'error');
    }

    if (currentUser && supabaseReady && imported > 0 && !hasPending) {
        syncSongsToCloud();
    }
});

function importListData(d) {
    if (Array.isArray(d.songs)) {
        d.songs.forEach(s => {
            const songId = s.id || genId();
            const existing = songs.find(x => x.id === songId);
            if (!existing) {
                const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
                songs.push({ id: songId, sourceId: s.id || null, sourceType: s.id ? 'imported' : undefined, title: s.title || 'Sin título', artist: s.artist || 'Desconocido', lyrics: s.lyrics || '', originalKey: dk, currentKey: dk, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags || [], audio_url: s.audio_url || null, createdAt: s.createdAt || Date.now(), updatedAt: Date.now(), createdBy: s.createdBy || '' });
            }
        });
    }
    const existing = lists.find(l => l.name === d.list?.name);
    if (existing) {
        const newIds = [...new Set([...existing.songIds, ...(d.list?.songIds || [])])];
        existing.songIds = newIds;
        existing.updatedAt = Date.now();
    } else {
        lists.unshift({ id: genId(), name: d.list?.name || 'Lista importada', description: d.list?.description || '', songIds: d.list?.songIds || [], createdAt: Date.now(), updatedAt: Date.now() });
    }
}

// ============= REPERTORIO FUNCTIONS =============
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function fmtDate(ds) { const d = new Date(ds + 'T12:00:00'); return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + '/' + MONTH_NAMES[d.getMonth()] }
function fmtShortDate(ds) { const d = new Date(ds + 'T12:00:00'); return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3) }

async function createRepertorio() {
    if (!repAdmin || !supabaseReady) return;
    const titulo = prompt('Nombre del repertorio (ej: 24/25 Agosto):');
    if (!titulo) return;
    const fecha = prompt('Fecha del domingo (YYYY-MM-DD):', '2026-08-24');
    if (!fecha) return;
    const d = new Date(fecha + 'T12:00:00');
    const dom = d.toISOString().split('T')[0];
    const lun = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
    const id = 'r' + Date.now().toString(36);
    try {
        const { error } = await supabaseClient.from('repertorios').insert({ id, titulo, fecha_domingo: dom, fecha_lunes: lun, mes: d.getMonth() + 1, año: d.getFullYear(), estado: 'activo', created_at: Date.now() });
        if (error) throw error;
        await loadRepertorios();
        renderRepertorios();
        alert('Repertorio creado');
        logActivity('rep_created', {
            repertorio: titulo,
            day: dom
        }, 'repertorio', id);
    } catch (e) { alert('Error: ' + e.message) }
}

async function addSongToRepertorio(repId, defaultDia) {
    if (!canManageReps() || !supabaseReady) return;
    if (songs.length === 0) { alert('No hay canciones en tu biblioteca'); return }
    addSongDefaultDia = defaultDia || 'ambos';
    addSongDirectMode = (addSongDefaultDia === 'ambos');
    const picker = document.getElementById('rep-song-picker');
    if (!picker) return;
    picker.classList.remove('hidden');
    picker.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:flex-end;justify-content:center" onclick="if(event.target===this)this.classList.add(\'hidden\')"><div style="background:#27272a;border-radius:16px 16px 0 0;width:100%;max-width:500px;max-height:calc(100vh - 20px);overflow-y:auto;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))"><h3 style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:12px">Seleccionar canción</h3><input type="text" id="rep-picker-search" class="input" placeholder="Buscar canción..." style="margin-bottom:10px" oninput="filterRepPicker()"><div id="rep-song-picker-list"></div></div></div>';
    const list = document.getElementById('rep-song-picker-list');
    list.innerHTML = songs.map(s => '<div class="card" style="margin-bottom:8px;padding:10px" onclick="confirmAddSongToRep(\'' + repId + '\',\'' + s.id + '\')"><div style="font-weight:600;color:#fff;font-size:.85rem">' + esc(s.title) + '</div><div style="font-size:.75rem;color:#a1a1aa">' + esc(s.artist) + '</div>' + (s.audio_url ? '<span style="font-size:.65rem;color:#4ade80">🎵 Audio vinculado</span>' : '') + '</div>').join('');
}

function filterRepPicker() {
    const q = (document.getElementById('rep-picker-search').value || '').toLowerCase();
    const list = document.getElementById('rep-song-picker-list');
    if (!list) return;
    const filtered = q ? songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)) : songs;
    list.innerHTML = filtered.map(s => '<div class="card" style="margin-bottom:8px;padding:10px" onclick="confirmAddSongToRep(\'' + (viewingRepId || '') + '\',\'' + s.id + '\')"><div style="font-weight:600;color:#fff;font-size:.85rem">' + esc(s.title) + '</div><div style="font-size:.75rem;color:#a1a1aa">' + esc(s.artist) + '</div>' + (s.audio_url ? '<span style="font-size:.65rem;color:#4ade80">🎵 Audio vinculado</span>' : '') + '</div>').join('');
    if (filtered.length === 0) list.innerHTML = '<div style="text-align:center;padding:20px;color:#71717a;font-size:.8rem">No se encontraron canciones</div>';
}

async function confirmAddSongToRep(repId, songId) {
    const s = songs.find(x => x.id === songId);
    const r = repertorios.find(x => x.id === repId);
    if (!s || !r) return;
    document.getElementById('rep-song-picker').innerHTML = '';

    if (addSongDirectMode) {
        const orden = r.canciones.length + 1;
        const id = 'rs' + Date.now().toString(36);
        const localSong = songs.find(x => x.id === songId);
        const vocalDom = localSong ? (localSong.vocalista_domingo || '') : '';
        const vocalLun = localSong ? (localSong.vocalista_lunes || '') : '';
        const corosDom = localSong ? (localSong.coros_domingo || []) : [];
        const corosLun = localSong ? (localSong.coros_lunes || []) : [];
        try {
            const { error } = await supabaseClient.from('canciones_repertorio').insert({
                id,
                repertorio_id: repId,
                titulo: s.title,
                artista: s.artist,
                dia: 'ambos',
                orden,
                tono_original: s.originalKey,
                tempo: s.tempo || 0,
                compas: s.compas || '',
                duracion: '0:00',
                vocalista_domingo: vocalDom,
                vocalista_lunes: vocalLun,
                coros_domingo: corosDom,
                coros_lunes: corosLun,
                letra_acordes: s.lyrics,
                audio_url: s.audio_url || null,
                source_song_id: s.id,
                created_by: s.createdBy || '',
                created_at: Date.now()
            });
            if (error) throw error;
            await loadRepertorios();
            renderRepertorios();
            showNotification('"' + s.title + '" agregada a ambos días', 'success');
        } catch (e) { alert('Error al guardar: ' + e.message) }
        return;
    }

    const ctxDay = addSongDefaultDia !== 'ambos' ? addSongDefaultDia : (repDay || 'domingo');
    vocalEditorDay = addSongDefaultDia;
    showVocalEditor(repId, songId, 'add', s, ctxDay);
logActivity('rep_song_added', {
    repertorio: r.titulo,
    dia: addSongDefaultDia,
    songTitle: s.title
}, 'repertorio', repId);
}

async function deleteRepertorio(repId) {
    if (!canManageReps() || !supabaseReady) return;
    const r = repertorios.find(x => x.id === repId);
    if (!confirm('¿Eliminar este repertorio y todas sus canciones?')) return;
    try {
        await supabaseClient.from('canciones_repertorio').delete().eq('repertorio_id', repId);
        await supabaseClient.from('repertorios').delete().eq('id', repId);
        await loadRepertorios();
        renderRepertorios();
        logActivity('rep_deleted', {
            repertorio: r ? r.titulo : repId
        }, 'repertorio', repId);
    } catch (e) { alert('Error: ' + e.message) }
}

function switchRepTab(tab) {
    repTab = tab;
    document.getElementById('rep-tab-active').className = 'rep-tab ' + (tab === 'active' ? 'active' : '');
    document.getElementById('rep-tab-history').className = 'rep-tab ' + (tab === 'history' ? 'active' : '');
    renderRepertorios()
}

function renderRepertorios() {
    const active = repertorios.filter(r => r.estado === 'activo').sort((a, b) => a.fecha_domingo > b.fecha_domingo ? 1 : a.fecha_domingo < b.fecha_domingo ? -1 : 0);
    const archived = repertorios.filter(r => r.estado === 'archivado');
    document.getElementById('rep-count').textContent = active.length + ' activos';
    const c = document.getElementById('rep-list');
    if (repTab === 'active') {
        const fc = document.getElementById('rep-filters');
        if (repAdmin) { fc.style.display = 'block';
            fc.innerHTML = '<button class="btn btn-amber" style="width:100%;margin-bottom:8px" onclick="createRepertorio()">+ Crear repertorio</button>' } else { fc.style.display = 'none' }
        if (active.length === 0) {
            c.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><h2>No hay repertorios activos</h2><p>' + (repAdmin ? 'Crea uno desde el botón de gestionar' : 'Espera a que el admin cree uno') + '</p></div>';
            return
        }
        c.innerHTML = active.map(r => {
            const sc = r.canciones.length;
            const vocs = [...new Set(r.canciones.map(c => (c.vocalista_domingo || '')).filter(Boolean))];
            return '<div class="rep-card" onclick="viewRepertorio(\'' + r.id + '\')"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1"><div class="rep-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + fmtDate(r.fecha_domingo) + ' | ' + fmtDate(r.fecha_lunes) + '</div><div class="rep-card-meta"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ' + sc + ' canciones</span>' + (vocs.length > 0 ? '<span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + vocs.join(', ') + '</span>' : '') + '</div>' + (sc === 0 ? '<p style="font-size:.7rem;color:#71717a;margin-top:6px;font-style:italic">Aún sin canciones asignadas</p>' : '') + '</div>' + (canManageReps() ? '<div style="display:flex;gap:4px;flex-shrink:0"><button class="btn-icon" onclick="event.stopPropagation();addSongToRepertorio(\'' + r.id + '\')" title="Agregar canción" style="color:#f59e0b"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();deleteRepertorio(\'' + r.id + '\')" title="Eliminar" style="color:#f87171"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>' : '') + '</div></div>';
        }).join('');
    } else {
        const uniqueYears = [...new Set(archived.map(r => r.año))].sort((a, b) => b - a);
        let filtered = archived;
        if (repHistoryMonth) filtered = filtered.filter(r => r.mes == repHistoryMonth);
        if (repHistoryYear) filtered = filtered.filter(r => r.año == repHistoryYear);
        filtered.sort((a, b) => b.fecha_domingo > a.fecha_domingo ? 1 : b.fecha_domingo < a.fecha_domingo ? -1 : 0);
        const fc = document.getElementById('rep-filters');
        fc.style.display = 'flex';
        fc.innerHTML = '<select class="input" style="flex:1;padding:6px 8px;font-size:.75rem" onchange="repHistoryMonth=this.value;renderRepertorios()"><option value="">Todos los meses</option>' + MONTH_NAMES.map((n, i) => '<option value="' + (i + 1) + '"' + (repHistoryMonth == i + 1 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select><select class="input" style="flex:1;padding:6px 8px;font-size:.75rem" onchange="repHistoryYear=this.value;renderRepertorios()"><option value="">Todos los años</option>' + uniqueYears.map(y => '<option value="' + y + '"' + (repHistoryYear == y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select>' + (repHistoryMonth || repHistoryYear ? '<button class="btn btn-zinc btn-sm" onclick="repHistoryMonth=\'\';repHistoryYear=\'\';renderRepertorios()">Limpiar</button>' : '');
        if (filtered.length === 0) {
            c.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/></svg></div><h2>No hay repertorios en el historial</h2></div>';
            return
        }
        c.innerHTML = filtered.map(r => {
            const sc = r.canciones.length;
            return '<div class="rep-card" onclick="viewRepertorio(\'' + r.id + '\')" style="opacity:.8"><div class="rep-card-title" style="color:#a1a1aa"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/></svg> ' + fmtDate(r.fecha_domingo) + ' | ' + fmtDate(r.fecha_lunes) + '</div><span style="font-size:.7rem;color:#71717a">' + sc + ' canciones</span></div>';
        }).join('');
    }
}

function viewRepertorio(id) {
    viewingRepId = id;
    var savedDay = load('cb_rep_day_' + id, null);
    repDay = savedDay || 'domingo';
    document.getElementById('rep-day-dom').className = 'rep-tab ' + (repDay === 'domingo' ? 'active' : '');
    document.getElementById('rep-day-lun').className = 'rep-tab ' + (repDay === 'lunes' ? 'active' : '');
    showPage('repertorio')
}

function switchRepDay(day) {
    repDay = day;
    save('cb_rep_day_' + viewingRepId, day);
    document.getElementById('rep-day-dom').className = 'rep-tab ' + (day === 'domingo' ? 'active' : '');
    document.getElementById('rep-day-lun').className = 'rep-tab ' + (day === 'lunes' ? 'active' : '');
    renderRepertorioView()
}

function saveDirige(repId, day, name) {
    if (!supabaseReady) return;
    var field = day === 'domingo' ? 'dirige_domingo' : 'dirige_lunes';
    var updateObj = {};
    updateObj[field] = name;
    supabaseClient.from('repertorios').update(updateObj).eq('id', repId).then(function(result) {
        if (result.error) { console.error('Save dirige error:', result.error); return }
        var r = repertorios.find(x => x.id === repId);
        if (r) r[field] = name;
        showNotification('Dirige actualizado', 'success');
    }).catch(function(e) { console.error('Save dirige error:', e) });
}

function renderRepertorioView() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    document.getElementById('rep-view-header').innerHTML = '<h1 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:4px">' + fmtDate(repDay === 'domingo' ? r.fecha_domingo : r.fecha_lunes) + '</h1><p style="font-size:.8rem;color:#71717a">' + fmtDate(repDay === 'domingo' ? r.fecha_lunes : r.fecha_domingo) + '</p>';
    const songsForDay = r.canciones.filter(s => s.dia === 'ambos' || s.dia === repDay).sort((a, b) => a.orden - b.orden);
    const c = document.getElementById('rep-view-songs');

    var canEditDir = canEditVocals();
    var dirigeName = repDay === 'domingo' ? (r.dirige_domingo || '') : (r.dirige_lunes || '');
    var dirigeField = canEditDir ? '<input class="input" style="max-width:250px;padding:5px 8px;font-size:.85rem" value="' + esc(dirigeName) + '" placeholder="Nombre del dirige" onchange="saveDirige(\'' + r.id + '\',\'' + repDay + '\',this.value)"/>' : '<span style="font-size:.9rem;color:#fbbf24;font-weight:600">' + (dirigeName ? esc(dirigeName) : '<span style="color:#52525b;font-weight:400;font-style:italic">Sin asignar</span>') + '</span>';
    var dirigeHtml = '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(39,39,42,.4);border:1px solid rgba(63,63,70,.4);border-radius:10px;margin-bottom:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style="font-size:.8rem;color:#a1a1aa">Dirige:</span>' + dirigeField + '</div>';

    if (songsForDay.length === 0) {
        c.innerHTML = dirigeHtml + '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>No hay canciones para este día</h2><p>' + (canManageReps() ? 'Agrega canciones con el botón de abajo' : 'El admin aún no ha asignado canciones') + '</p>' + (canManageReps() ? '<button class="btn btn-amber" style="margin-top:10px" onclick="addSongToRepertorio(\'' + r.id + '\',\'' + repDay + '\')">+ Agregar canción</button>' : '') + '</div>';
        return
    }

    c.innerHTML = dirigeHtml + songsForDay.map(s => {
        var corosForDay = (repDay === 'domingo' ? (s.coros_domingo || []) : (s.coros_lunes || s.coros_domingo || []));
        if (typeof corosForDay === 'string') corosForDay = corosForDay ? corosForDay.split(',').map(function(x) { return x.trim() }).filter(Boolean) : [];
        if (!Array.isArray(corosForDay)) corosForDay = [];
        const corosDisplay = corosForDay.length > 0 ? corosForDay.map(function(c, i) {
            return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px"><span style="width:14px;height:14px;background:rgba(245,158,11,.2);color:#fbbf24;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:700">' + (i + 1) + '</span><span style="color:#a1a1aa;font-size:.7rem">' + esc(c) + '</span></span>'
        }).join('') : '';

        return '<div class="rep-song-card" data-song-id="' + s.id + '" onclick="viewRepSong(\'' + r.id + '\',\'' + s.id + '\')">' + (canManageReps() ? '<div class="rep-drag-handle" onclick="event.stopPropagation()" style="cursor:grab;color:#52525b;display:flex;align-items:center;justify-content:center;padding:0 6px;touch-action:none;align-self:stretch;flex-shrink:0"><svg width="14" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg></div>' : '') + '<div class="rep-song-order">' + s.orden + '</div><div class="rep-song-info"><div class="rep-song-title">' + esc(s.titulo) + '</div><div class="rep-song-artist">' + esc(s.artista) + '</div><div class="rep-song-vocals"><span class="rep-vocal-main"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Principal: ' + esc((repDay === 'domingo' ? (s.vocalista_domingo || 'Por asignar') : (s.vocalista_lunes || s.vocalista_domingo || 'Por asignar'))) + '</span>' + (corosForDay.length > 0 ? '<span class="rep-vocal-chorus" style="display:inline-flex;flex-wrap:wrap;align-items:center">' + corosDisplay + '</span>' : '') + '</div><div class="rep-song-meta"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg> ' + dn(s.tono_original) + '</span>' + (s.compas ? '<span class="rep-meta-item">' + s.compas + '</span>' : '') + (s.tempo ? '<span class="rep-meta-item">' + s.tempo + ' BPM</span>' : '') + '</div>' + (s.dia !== 'ambos' ? '<span class="rep-day-badge ' + (s.dia === 'domingo' ? 'dom' : 'lun') + '">Solo ' + (s.dia === 'domingo' ? 'Domingo' : 'Lunes') + '</span>' : '') + '</div>' + (canEditVocals() ? '<button class="btn-icon" onclick="event.stopPropagation();editRepVocals(\'' + r.id + '\',\'' + s.id + '\')" title="Editar vocales" style="color:#f59e0b;flex-shrink:0;align-self:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' : '') + (canManageReps() ? '<button class="btn-icon btn-icon-red" onclick="event.stopPropagation();deleteRepSong(\'' + r.id + '\',\'' + s.id + '\')" title="Eliminar canción" style="flex-shrink:0;align-self:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') + '</div>';
    }).join('') + (canManageReps() ? '<div style="text-align:center;padding:16px 0"><button class="btn btn-amber" onclick="addSongToRepertorio(\'' + r.id + '\',\'' + repDay + '\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar canción</button></div>' : '');
    initRepDragHandles();
}

// ============= DRAG & DROP para reordenar canciones del repertorio =============
let _repDrag = null;

function initRepDragHandles() {
    if (!canManageReps()) return;
    const container = document.getElementById('rep-view-songs');
    if (!container) return;
    container.querySelectorAll('.rep-song-card').forEach(card => {
        const handle = card.querySelector('.rep-drag-handle');
        if (!handle) return;
        handle.onpointerdown = (e) => startRepDrag(e, card, container);
    });
}

function startRepDrag(e, card, container) {
    e.preventDefault();
    const cards = [...container.querySelectorAll('.rep-song-card')];
    _repDrag = { card, container, cards, startY: e.clientY };
    card.style.position = 'relative';
    card.style.zIndex = '10';
    card.style.boxShadow = '0 8px 20px rgba(0,0,0,.4)';
    card.style.transition = 'none';
    document.addEventListener('pointermove', onRepDragMove);
    document.addEventListener('pointerup', onRepDragEnd, { once: true });
}

function onRepDragMove(e) {
    if (!_repDrag) return;
    const { card, container } = _repDrag;
    const dy = e.clientY - _repDrag.startY;
    card.style.transform = 'translateY(' + dy + 'px)';
    const cardMidY = card.getBoundingClientRect().top + card.offsetHeight / 2;
    const cards = [...container.querySelectorAll('.rep-song-card')];
    const idx = cards.indexOf(card);
    for (let i = 0; i < cards.length; i++) {
        const other = cards[i];
        if (other === card) continue;
        const rect = other.getBoundingClientRect();
        if (cardMidY > rect.top && cardMidY < rect.bottom) {
            if (i < idx) container.insertBefore(card, other);
            else container.insertBefore(card, other.nextSibling);
            _repDrag.startY = e.clientY;
            card.style.transform = 'translateY(0px)';
            break;
        }
    }
}

async function onRepDragEnd() {
    if (!_repDrag) return;
    const { card, container } = _repDrag;
    document.removeEventListener('pointermove', onRepDragMove);
    card.style.transform = '';
    card.style.position = '';
    card.style.zIndex = '';
    card.style.boxShadow = '';
    const finalCards = [...container.querySelectorAll('.rep-song-card')];
    const idx = finalCards.indexOf(card);
    const afterNeighborId = finalCards[idx + 1] ? finalCards[idx + 1].dataset.songId : null;
    const draggedId = card.dataset.songId;
    _repDrag = null;
    await commitRepDragOrder(draggedId, afterNeighborId);
}

// Reordena por ID dentro de la lista GLOBAL del repertorio (mismo criterio que
// ya usaba moveRepSong): se saca la canción arrastrada y se reinserta justo
// antes de su nuevo "vecino de abajo" visible en el día actual, preservando el
// orden relativo del resto (incluidas canciones "ambos" que aparecen en los dos días).
async function commitRepDragOrder(draggedId, afterNeighborId) {
    if (!canManageReps() || !supabaseReady) { renderRepertorioView(); return }
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const globalSorted = r.canciones.slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const idx = globalSorted.findIndex(x => x.id === draggedId);
    if (idx < 0) return;
    const [dragged] = globalSorted.splice(idx, 1);
    let insertAt = globalSorted.length;
    if (afterNeighborId) {
        const ni = globalSorted.findIndex(x => x.id === afterNeighborId);
        if (ni >= 0) insertAt = ni;
    }
    globalSorted.splice(insertAt, 0, dragged);
    try {
        for (let i = 0; i < globalSorted.length; i++) {
            const newOrden = i + 1;
            if (globalSorted[i].orden !== newOrden) {
                globalSorted[i].orden = newOrden;
                await supabaseClient.from('canciones_repertorio').update({ orden: newOrden }).eq('id', globalSorted[i].id);
            }
        }
        await loadRepertorios();
        renderRepertorioView();
    } catch (e) { alert('Error al reordenar: ' + e.message); renderRepertorioView() }
}

function viewRepSong(rid, sid) {
    stopAllAudio();
    viewingRepId = rid;
    viewingRepSongId = sid;
    repShowChords = true;
    const r = repertorios.find(x => x.id === rid);
    if (r) {
        const songsForDay = r.canciones.filter(s => s.dia === 'ambos' || s.dia === repDay).sort((a, b) => a.orden - b.orden);
        const idx = songsForDay.findIndex(x => x.id === sid);
        if (idx >= 0) repSongNavIndex = idx;
    }
    showPage('rep-song')
}

function goBackFromRepSong() { stopAllAudio();
    showPage('repertorio') }

function setRepSongView(showChords) {
    repShowChords = showChords;
    document.getElementById('toggle-lyrics').className = showChords ? 'inactive' : 'active';
    document.getElementById('toggle-chords').className = showChords ? 'active' : 'inactive';
    renderRepSongLyrics()
}

function renderRepSongView() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return;

    const nav = document.getElementById('rep-song-nav');
    const songsForDay = r.canciones.filter(x => x.dia === 'ambos' || x.dia === repDay).sort((a, b) => a.orden - b.orden);
    if (songsForDay.length > 1) {
        nav.classList.remove('hidden');
        const curIdx = songsForDay.findIndex(x => x.id === viewingRepSongId);
        if (curIdx >= 0) repSongNavIndex = curIdx;
        document.getElementById('rep-song-nav-info').textContent = (repSongNavIndex + 1) + ' / ' + songsForDay.length;
        document.getElementById('rep-song-prev-btn').disabled = repSongNavIndex <= 0;
        document.getElementById('rep-song-next-btn').disabled = repSongNavIndex >= songsForDay.length - 1;
    } else { nav.classList.add('hidden') }

    repCurrentKey = s.tono_original;
    var corosForDay = (repDay === 'domingo' ? (s.coros_domingo || []) : (s.coros_lunes || s.coros_domingo || []));
    if (typeof corosForDay === 'string') corosForDay = corosForDay ? corosForDay.split(',').map(function(x) { return x.trim() }).filter(Boolean) : [];
    if (!Array.isArray(corosForDay)) corosForDay = [];

    const saveBtn = document.getElementById('save-rep-btn');
    if (saveBtn) {
        const already = songs.find(x => x.title === s.titulo && x.artist === s.artista);
        if (already) {
            saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Guardada';
            saveBtn.style.background = 'rgba(34,197,94,.2)';
            saveBtn.style.color = '#4ade80';
            saveBtn.style.borderColor = 'rgba(34,197,94,.3)';
            saveBtn.disabled = true;
        } else {
            saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Guardar';
            saveBtn.style.background = 'rgba(39,39,46,.8)';
            saveBtn.style.color = '#a1a1aa';
            saveBtn.style.borderColor = 'rgba(63,63,70,.5)';
            saveBtn.disabled = false;
        }
    }

    const ntBtn = document.getElementById('notation-toggle');
    if (ntBtn) ntBtn.innerHTML = useFlats ? '♭' : '#';

    const dayName = repDay === 'domingo' ? 'Domingo' : 'Lunes';
    const dayColor = repDay === 'domingo' ? '#60a5fa' : '#c084fc';
    const dayEmoji = repDay === 'domingo' ? '🌞' : '🌙';

    document.getElementById('rep-song-info').innerHTML = '<div style="text-align:center;margin-bottom:8px"><span style="font-size:.85rem;font-weight:700;color:' + dayColor + ';display:inline-flex;align-items:center;gap:4px;padding:4px 14px;background:' + (repDay === 'domingo' ? 'rgba(59,130,246,.15)' : 'rgba(168,85,247,.15)') + ';border:1px solid ' + (repDay === 'domingo' ? 'rgba(59,130,246,.3)' : 'rgba(168,85,247,.3)') + ';border-radius:8px">' + dayEmoji + ' ' + dayName + '</span></div><h1 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:2px">' + esc(s.titulo) + '</h1><p style="font-size:.8rem;color:#a1a1aa;margin-bottom:6px">' + esc(s.artista) + '</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:.75rem;color:#fbbf24;display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Principal: ' + esc(repDay === 'domingo' ? (s.vocalista_domingo || 'Por asignar') : (s.vocalista_lunes || s.vocalista_domingo || 'Por asignar')) + '</span>' + (corosForDay.length > 0 ? '<span style="font-size:.7rem;color:#a1a1aa;display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px">' + corosForDay.map(function(c, i) { return '<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:14px;height:14px;background:rgba(245,158,11,.2);color:#fbbf24;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:700">' + (i + 1) + '</span><span>' + esc(c) + '</span></span>' }).join('') + '</span>' : '') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg> ' + dn(s.tono_original) + '</span>' + (s.compas ? '<span class="rep-meta-item">' + s.compas + '</span>' : '') + (s.tempo ? '<span class="rep-meta-item">' + s.tempo + ' BPM</span>' : '') + '</div>';

    document.getElementById('rep-song-key').innerHTML = '<button class="key-btn" onclick="changeRepKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button><button id="notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">' + (useFlats ? '\u266D' : '#') + '</button><div class="key-display"><div class="key-note">' + dn(repCurrentKey) + '</div>' + (repCurrentKey !== s.tono_original ? '<button class="key-original" onclick="resetRepKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: ' + dn(s.tono_original) + '</button>' : '') + '</div><button class="key-btn" onclick="changeRepKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>';

    // Build vocal audios section
    let vocalAudiosHtml = '';
    if (r && r.vocalAudios) {
        const sourceSongId = s.source_song_id || viewingRepSongId;
        const songAudios = r.vocalAudios.filter(va => (va.source_song_id || va.cancion_repertorio_id) === sourceSongId);
        const corosDom = Array.isArray(s.coros_domingo) ? s.coros_domingo : [];
        const corosLun = Array.isArray(s.coros_lunes) ? s.coros_lunes : [];
        const domAudios = songAudios.filter(va => va.dia === 'domingo');
        const lunAudios = songAudios.filter(va => va.dia === 'lunes');
        const hasAnyAudio = domAudios.some(a => a.audio_url) || lunAudios.some(a => a.audio_url);

        if (hasAnyAudio || corosDom.length > 0 || corosLun.length > 0) {
            vocalAudiosHtml = '<div style="display:flex;flex-direction:column;gap:10px">';

            // Colores: Coros 1&3 = amber, Coros 2&4 = cyan
            const coroColors = [
                { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.25)', text: '#fbbf24', badge: 'rgba(245,158,11,.2)' },
                { bg: 'rgba(34,211,238,.06)', border: 'rgba(34,211,238,.2)', text: '#22d3ee', badge: 'rgba(34,211,238,.15)' },
                { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.25)', text: '#fbbf24', badge: 'rgba(245,158,11,.2)' },
                { bg: 'rgba(34,211,238,.06)', border: 'rgba(34,211,238,.2)', text: '#22d3ee', badge: 'rgba(34,211,238,.15)' }
            ];

            if (repDay === 'domingo') {
                vocalAudiosHtml += '<div style="background:rgba(27,27,30,.4);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:10px">';
                vocalAudiosHtml += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px"><span style="font-size:.75rem;font-weight:600;color:#fbbf24">🌞 Domingo</span>';
                if (s.vocalista_domingo) vocalAudiosHtml += '<span style="font-size:.6rem;color:#71717a">· Principal: ' + esc(s.vocalista_domingo) + '</span>';
                vocalAudiosHtml += '</div>';
                vocalAudiosHtml += '<div style="display:flex;flex-direction:column;gap:4px">';
                for (let coro = 1; coro <= 4; coro++) {
                    const audioA = domAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'a');
                    const audioB = domAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'b');
                    const coroNameA = (Array.isArray(corosDom) && corosDom[coro - 1]) ? corosDom[coro - 1] : '';
                    const corosDomB = s.coros_domingo_b ? (typeof s.coros_domingo_b === 'string' ? JSON.parse(s.coros_domingo_b || '[]') : s.coros_domingo_b) : [];
                    const coroNameB = (Array.isArray(corosDomB) && corosDomB[coro - 1]) ? corosDomB[coro - 1] : '';
                    const cc = coroColors[coro - 1];
                    const audioKeyA = viewingRepId + '_' + viewingRepSongId + '_domingo_' + coro + '_a';
                    const audioKeyB = viewingRepId + '_' + viewingRepSongId + '_domingo_' + coro + '_b';
                    const hasA = !!(coroNameA || (audioA && audioA.audio_url));
                    const hasB = !!(coroNameB || (audioB && audioB.audio_url));
                    const cellA = '<div style="display:flex;align-items:center;gap:4px;padding:4px 5px;background:' + cc.bg + ';border-radius:5px;border:1px solid ' + cc.border + '">'
                        + '<span style="min-width:14px;font-size:.55rem;color:' + cc.text + ';font-weight:700;background:' + cc.badge + ';padding:1px 3px;border-radius:3px;text-align:center">' + coro + 'A</span>'
                        + (audioA && audioA.audio_url ? '<button class="btn-icon" data-vocal-key="' + audioKeyA + '" onclick="playVocalAudio(\'' + audioKeyA + '\',\'' + audioA.audio_url + '\')" style="color:#4ade80;padding:1px" title="Reproducir"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>' : '')
                        + '<div style="flex:1;min-width:0;font-size:.6rem;color:' + (coroNameA ? '#d4d4d8' : '#52525b') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (coroNameA ? esc(coroNameA) : (audioA && audioA.audio_url ? 'Audio' : '—')) + '</div>'
                        + '</div>';
                    const cellB = '<div style="display:flex;align-items:center;gap:4px;padding:4px 5px;background:' + cc.bg + ';border-radius:5px;border:1px solid ' + cc.border + '">'
                        + '<span style="min-width:14px;font-size:.55rem;color:' + cc.text + ';font-weight:700;background:' + cc.badge + ';padding:1px 3px;border-radius:3px;text-align:center">' + coro + 'B</span>'
                        + (audioB && audioB.audio_url ? '<button class="btn-icon" data-vocal-key="' + audioKeyB + '" onclick="playVocalAudio(\'' + audioKeyB + '\',\'' + audioB.audio_url + '\')" style="color:#4ade80;padding:1px" title="Reproducir"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>' : '')
                        + '<div style="flex:1;min-width:0;font-size:.6rem;color:' + (coroNameB ? '#d4d4d8' : '#52525b') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (coroNameB ? esc(coroNameB) : (audioB && audioB.audio_url ? 'Audio' : '—')) + '</div>'
                        + '</div>';
                    if (hasA === hasB) {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">' + cellA + cellB + '</div>';
                    } else if (hasA) {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr;gap:4px">' + cellA + '</div>';
                    } else {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr;gap:4px">' + cellB + '</div>';
                    }
                }
                vocalAudiosHtml += '</div></div>';
            }

            if (repDay === 'lunes') {
                vocalAudiosHtml += '<div style="background:rgba(27,27,30,.4);border:1px solid rgba(192,132,252,.2);border-radius:10px;padding:10px">';
                vocalAudiosHtml += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px"><span style="font-size:.75rem;font-weight:600;color:#c084fc">🌙 Lunes</span>';
                if (s.vocalista_lunes) vocalAudiosHtml += '<span style="font-size:.6rem;color:#71717a">· Principal: ' + esc(s.vocalista_lunes) + '</span>';
                vocalAudiosHtml += '</div>';
                vocalAudiosHtml += '<div style="display:flex;flex-direction:column;gap:4px">';
                for (let coro = 1; coro <= 4; coro++) {
                    const audioA = lunAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'a');
                    const audioB = lunAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'b');
                    const coroNameA = (Array.isArray(corosLun) && corosLun[coro - 1]) ? corosLun[coro - 1] : '';
                    const corosLunB = s.coros_lunes_b ? (typeof s.coros_lunes_b === 'string' ? JSON.parse(s.coros_lunes_b || '[]') : s.coros_lunes_b) : [];
                    const coroNameB = (Array.isArray(corosLunB) && corosLunB[coro - 1]) ? corosLunB[coro - 1] : '';
                    const cc = coroColors[coro - 1];
                    const audioKeyA = viewingRepId + '_' + viewingRepSongId + '_lunes_' + coro + '_a';
                    const audioKeyB = viewingRepId + '_' + viewingRepSongId + '_lunes_' + coro + '_b';
                    const hasA = !!(coroNameA || (audioA && audioA.audio_url));
                    const hasB = !!(coroNameB || (audioB && audioB.audio_url));
                    const cellA = '<div style="display:flex;align-items:center;gap:4px;padding:4px 5px;background:' + cc.bg + ';border-radius:5px;border:1px solid ' + cc.border + '">'
                        + '<span style="min-width:14px;font-size:.55rem;color:' + cc.text + ';font-weight:700;background:' + cc.badge + ';padding:1px 3px;border-radius:3px;text-align:center">' + coro + 'A</span>'
                        + (audioA && audioA.audio_url ? '<button class="btn-icon" data-vocal-key="' + audioKeyA + '" onclick="playVocalAudio(\'' + audioKeyA + '\',\'' + audioA.audio_url + '\')" style="color:#4ade80;padding:1px" title="Reproducir"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>' : '')
                        + '<div style="flex:1;min-width:0;font-size:.6rem;color:' + (coroNameA ? '#d4d4d8' : '#52525b') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (coroNameA ? esc(coroNameA) : (audioA && audioA.audio_url ? 'Audio' : '—')) + '</div>'
                        + '</div>';
                    const cellB = '<div style="display:flex;align-items:center;gap:4px;padding:4px 5px;background:' + cc.bg + ';border-radius:5px;border:1px solid ' + cc.border + '">'
                        + '<span style="min-width:14px;font-size:.55rem;color:' + cc.text + ';font-weight:700;background:' + cc.badge + ';padding:1px 3px;border-radius:3px;text-align:center">' + coro + 'B</span>'
                        + (audioB && audioB.audio_url ? '<button class="btn-icon" data-vocal-key="' + audioKeyB + '" onclick="playVocalAudio(\'' + audioKeyB + '\',\'' + audioB.audio_url + '\')" style="color:#4ade80;padding:1px" title="Reproducir"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>' : '')
                        + '<div style="flex:1;min-width:0;font-size:.6rem;color:' + (coroNameB ? '#d4d4d8' : '#52525b') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (coroNameB ? esc(coroNameB) : (audioB && audioB.audio_url ? 'Audio' : '—')) + '</div>'
                        + '</div>';
                    if (hasA === hasB) {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">' + cellA + cellB + '</div>';
                    } else if (hasA) {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr;gap:4px">' + cellA + '</div>';
                    } else {
                        vocalAudiosHtml += '<div style="display:grid;grid-template-columns:1fr;gap:4px">' + cellB + '</div>';
                    }
                }
                vocalAudiosHtml += '</div></div>';
            }

            vocalAudiosHtml += '</div>';
        }
    }

    // En app.js, en la función renderRepSongView(), reemplaza esta sección:
    document.getElementById('rep-song-audio').innerHTML = (s.audio_url ? '<div class="audio-player" id="rep-audio-player"><button class="audio-play-btn" onclick="toggleRepAudio()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekRepAudio(event)" ontouchstart="seekRepAudioTouch(event)" ontouchmove="seekRepAudioTouch(event)" style=touch-action:none"><div class="audio-bar-fill" id="rep-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="rep-audio-current">0:00</span><span id="rep-audio-duration">--:--</span></div></div></div>' : '<div style="background:rgba(39,39,42,.3);border:1px solid rgba(63,63,70,.3);border-radius:12px;padding:16px;text-align:center;margin-bottom:12px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2" style="margin:0 auto 8px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><p style="font-size:.8rem;color:#71717a">Audio no disponible</p></div>') + (vocalAudiosHtml ? '<div style="margin-top:16px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span style="font-size:.85rem;font-weight:600;color:#fbbf24">Audios de voces</span></div>' + vocalAudiosHtml + '<div id="vocal-audio-player-bar" class="audio-player" style="display:none;margin-top:10px"><button class="audio-play-btn" onclick="toggleVocalAudioFromBar()" style="width:36px;height:36px"><svg width="16" height="16" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekVocalAudio(event)" ontouchstart="seekVocalAudioTouch(event)" ontouchmove="seekVocalAudioTouch(event)" style="touch-action:none"><div class="audio-bar-fill" id="vocal-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="vocal-audio-current">0:00</span><span id="vocal-audio-duration">--:--</span></div></div></div></div>' : '');
    document.getElementById('toggle-lyrics').className = repShowChords ? 'inactive' : 'active';
    document.getElementById('toggle-chords').className = repShowChords ? 'active' : 'inactive';

    const adminActions = document.getElementById('rep-song-admin-actions');
    if (adminActions) {
        if (canManageReps()) {
            adminActions.innerHTML = '<button class="btn btn-sm" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);gap:4px;margin-left:4px" onclick="deleteRepSong(\'' + viewingRepId + '\',\'' + viewingRepSongId + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Eliminar</button>';
        } else {
            adminActions.innerHTML = '';
        }
    }
    renderRepSongLyrics();
}

function deleteRepSong(repId, songId) {
    if (!canManageReps() || !supabaseReady) return;
    const r = repertorios.find(x => x.id === repId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === songId);
    if (!s) return;
    if (!confirm('¿Eliminar "' + s.titulo + '" de este repertorio?')) return;
    supabaseClient.from('canciones_repertorio').delete().eq('id', songId).then(async function(result) {
        if (result.error) { alert('Error: ' + result.error.message); return }
        await loadRepertorios();
        await renumberRepSongs(repId);
        await loadRepertorios();
        if (viewingRepId === repId && viewingRepSongId === songId) {
            showPage('repertorio');
        } else {
            renderRepertorioView();
        }
    }).catch(function(e) { alert('Error: ' + e.message) });
logActivity('rep_song_removed', {
    repertorio: r.titulo,
    songTitle: s.titulo
}, 'repertorio', repId);
}

function changeRepKey(d) {
    const r = repertorios.find(x => x.id === viewingRepId);
    const s = r?.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return;
    const currentIdx = NOTE_MAP[repCurrentKey] ?? 0;
    const newIdx = (currentIdx + d + 12) % 12;
    repCurrentKey = useFlats ? FLATS[newIdx] : SHARPS[newIdx];
    document.getElementById('rep-song-key').innerHTML = '<button class="key-btn" onclick="changeRepKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button><button id="notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">' + (useFlats ? '\u266D' : '#') + '</button><div class="key-display"><div class="key-note">' + dn(repCurrentKey) + '</div>' + (repCurrentKey !== s.tono_original ? '<button class="key-original" onclick="resetRepKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: ' + dn(s.tono_original) + '</button>' : '') + '</div><button class="key-btn" onclick="changeRepKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>';
    renderRepSongLyrics()
}

function resetRepKey() {
    const r = repertorios.find(x => x.id === viewingRepId);
    const s = r?.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return;
    repCurrentKey = s.tono_original;
    changeRepKey(0)
}

async function renderRepSongLyrics() {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === viewingRepSongId);
    if (!s) return;
    const semi = getS(s.tono_original, repCurrentKey);
    const c = document.getElementById('rep-song-lyrics');

    if (repShowChords) {
        c.innerHTML = s.letra_acordes.split('\n').map(line => {
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
        }).join('') + getSongNoteHtml(s)
    } else {
        var lyricsHtml = '';
        var srcId = s.source_song_id || viewingRepSongId;
        var sectionNotes = {};
        if (srcId) { sectionNotes = await loadSectionNotes(srcId, repDay) }
        s.letra_acordes.split('\n').forEach(function(line) {
            var t2 = semi !== 0 ? transposeLine(line, semi) : line;
            if (/\[[^\]]+\]/.test(t2)) {
                var stripped = t2.replace(/\s*\[[^\]]+\]\s*/g, ' ').trim();
                var h2 = '<div class="lyrics-line">';
                if (/\(([^)]+)\)/.test(t2)) {
                    var secMatch = t2.match(/\(([^)]+)\)/);
                    var secName = secMatch ? secMatch[1] : '';
                    var idMatch = t2.match(/\)\s*\{(\d+)\}/);
                    var secId = idMatch ? idMatch[1] : '';
                    var noteKey = secId ? secName + '_' + secId : secName;
                    var noteVal = (sectionNotes[noteKey] || '').replace(/"/g, '&quot;');
                    var displayLine = stripped.replace(/\s*\{\d+\}/g, '');
                    h2 += displayLine.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                    if (srcId && canEditVocals()) {
                        h2 += '<span class="section-note-wrap"><input class="section-note-input" value="' + noteVal + '" placeholder="nota..." oninput="onSectionNoteInput(\'' + srcId + '\',\'' + repDay + '\',\'' + noteKey.replace(/'/g, "\\'") + '\',this)"><span class="section-note-status"></span></span>'
                    } else if (sectionNotes[noteKey]) { h2 += '<span class="section-note-display">' + esc(sectionNotes[noteKey]) + '</span>' }
                }
                lyricsHtml += h2 + '</div>'
            } else if (/\(([^)]+)\)/.test(t2)) {
                var secMatch2 = t2.match(/\(([^)]+)\)/);
                var secName2 = secMatch2 ? secMatch2[1] : '';
                var idMatch2 = t2.match(/\)\s*\{(\d+)\}/);
                var secId2 = idMatch2 ? idMatch2[1] : '';
                var noteKey2 = secId2 ? secName2 + '_' + secId2 : secName2;
                var noteVal2 = (sectionNotes[noteKey2] || '').replace(/"/g, '&quot;');
                var displayLine2 = t2.replace(/\s*\{\d+\}/g, '');
                var h3 = '<div class="lyrics-line">' + displayLine2.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                if (srcId && canEditVocals()) {
                    h3 += '<span class="section-note-wrap"><input class="section-note-input" value="' + noteVal2 + '" placeholder="nota..." oninput="onSectionNoteInput(\'' + srcId + '\',\'' + repDay + '\',\'' + noteKey2.replace(/'/g, "\\'") + '\',this)"><span class="section-note-status"></span></span>'
                } else if (sectionNotes[noteKey2]) { h3 += '<span class="section-note-display">' + esc(sectionNotes[noteKey2]) + '</span>' }
                lyricsHtml += h3 + '</div>'
            } else {
                lyricsHtml += '<div class="lyrics-line">' + (t2 || '&nbsp;') + '</div>'
            }
        });
        lyricsHtml += getSongNoteHtml(s);
        c.innerHTML = lyricsHtml
    }
}

function repSongNav(dir) {
    const r = repertorios.find(x => x.id === viewingRepId);
    if (!r) return;
    const songsForDay = r.canciones.filter(s => s.dia === 'ambos' || s.dia === repDay).sort((a, b) => a.orden - b.orden);
    const newIdx = repSongNavIndex + dir;
    if (newIdx >= 0 && newIdx < songsForDay.length) {
        stopAllAudio();
        repSongNavIndex = newIdx;
        viewingRepSongId = songsForDay[newIdx].id;
        repShowChords = true;
        showPage('rep-song')
    }
}

function goBackFromView() {
    if (viewReturnTo === 'listview') { showPage('listview') } else { showPage('library') }
}

// ============= VOCAL EDITOR =============
function editRepVocals(repId, songId) {
    const r = repertorios.find(x => x.id === repId);
    if (!r) return;
    const s = r.canciones.find(x => x.id === songId);
    if (!s) return;
    showVocalEditor(repId, songId, 'edit', s, repDay);
}

function showVocalEditor(repId, songId, mode, songData, contextDay) {
    vocalEditorRepId = repId;
    vocalEditorSongId = songId;
    vocalEditorMode = mode;
    vocalEditorContextDay = contextDay || 'domingo';
    vocalEditorDay = songData ? (songData.dia || 'ambos') : 'ambos';

    const isDom = vocalEditorContextDay === 'domingo';
    const dayColor = isDom ? '#fbbf24' : '#c084fc';
    const dayLabel = isDom ? 'Domingo' : 'Lunes';
    const dayEmoji = isDom ? '🌞' : '🌙';

    document.getElementById('vocal-editor-title').textContent = mode === 'add' ? 'Asignar vocales' : 'Editar vocales';
    document.getElementById('vocal-editor-subtitle').textContent = 'Para ' + dayEmoji + ' ' + dayLabel;

    const badge = document.getElementById('vocal-editor-day-badge');
    badge.textContent = dayLabel;
    badge.style.background = isDom ? 'rgba(245,158,11,.2)' : 'rgba(192,132,252,.2)';
    badge.style.color = dayColor;

    document.getElementById('vocal-main-label').textContent = 'Vocalista principal ' + dayLabel;
    document.getElementById('vocal-main-label').style.color = dayColor;
    document.getElementById('vocal-coros-label').textContent = 'Coros ' + dayLabel;
    document.getElementById('vocal-coros-label').style.color = dayColor;

    const mainSvg = document.querySelector('#vocal-section-main svg');
    if (mainSvg) mainSvg.setAttribute('stroke', dayColor);
    const corosSvg = document.querySelector('#vocal-section-coros svg');
    if (corosSvg) corosSvg.setAttribute('stroke', dayColor);

    const localSong = songs.find(x => x.id === songId);
    const savedVocals = localSong ? {
        vocalista_domingo: localSong.vocalista_domingo || '',
        vocalista_lunes: localSong.vocalista_lunes || '',
        coros_domingo: localSong.coros_domingo || [],
        coros_lunes: localSong.coros_lunes || []
    } : null;

    let mainName = '';
    let corosRaw = [];
    if (isDom) {
        mainName = songData ? (songData.vocalista_domingo || '') : (savedVocals ? savedVocals.vocalista_domingo : '');
        corosRaw = songData ? (songData.coros_domingo || []) : (savedVocals ? savedVocals.coros_domingo : []);
    } else {
        mainName = songData ? (songData.vocalista_lunes || '') : (savedVocals ? savedVocals.vocalista_lunes : '');
        corosRaw = songData ? (songData.coros_lunes || []) : (savedVocals ? savedVocals.coros_lunes : []);
    }
    if (typeof corosRaw === 'string') corosRaw = corosRaw ? corosRaw.split(',').map(function(x) { return x.trim() }).filter(Boolean) : [];
    if (!Array.isArray(corosRaw)) corosRaw = [];

    document.getElementById('vocal-input-main').value = mainName;
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i);
        if (el) el.value = corosRaw[i - 1] || '';
    }
    // Load part B names
    let corosRawB = [];
    if (isDom) {
        const rawB = songData ? (songData.coros_domingo_b || []) : (savedVocals ? (savedVocals.coros_domingo_b || []) : []);
        corosRawB = typeof rawB === 'string' ? (rawB ? JSON.parse(rawB) : []) : (Array.isArray(rawB) ? rawB : []);
    } else {
        const rawB = songData ? (songData.coros_lunes_b || []) : (savedVocals ? (savedVocals.coros_lunes_b || []) : []);
        corosRawB = typeof rawB === 'string' ? (rawB ? JSON.parse(rawB) : []) : (Array.isArray(rawB) ? rawB : []);
    }
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i + 'b');
        if (el) el.value = corosRawB[i - 1] || '';
    }

    renderVocalAudioList(vocalEditorContextDay);

    document.getElementById('vocal-editor-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('vocal-input-main').focus(), 100);
}

function renderVocalAudioList(day) {
    const list = document.getElementById('vocal-audio-list');
    if (!list) return;
    const r = repertorios.find(x => x.id === vocalEditorRepId);
    const cancionesRep = r ? r.canciones.find(x => x.id === vocalEditorSongId) : null;
    const sourceSongId = cancionesRep ? (cancionesRep.source_song_id || vocalEditorSongId) : vocalEditorSongId;
    const songAudios = [];
    if (r && r.vocalAudios) {
        r.vocalAudios.forEach(va => {
            if ((va.source_song_id || va.cancion_repertorio_id) === sourceSongId && va.dia === day) {
                songAudios.push(va);
            }
        });
    }
    const coroNames = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i);
        coroNames.push(el ? el.value.trim() : '');
    }
    let html = '';
    const isDom = day === 'domingo';
    const dayColor = isDom ? '#fbbf24' : '#c084fc';
    const coroColors = ['#fbbf24', '#22d3ee', '#fbbf24', '#22d3ee'];
    for (let coro = 1; coro <= 4; coro++) {
        const audioA = songAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'a');
        const audioB = songAudios.find(va => va.coro_number === coro && (va.part || 'a') === 'b');
        const coroNameA = coroNames[coro - 1] || '';
        const coroNamesB = [];
        for (let i = 1; i <= 4; i++) {
            const el = document.getElementById('vocal-coro-' + i + 'b');
            coroNamesB.push(el ? el.value.trim() : '');
        }
        const coroNameB = coroNamesB[coro - 1] || '';
        const cc = coroColors[coro - 1];
        const audioKey = vocalEditorRepId + '_' + vocalEditorSongId + '_' + day + '_' + coro;
        html += '<div style="background:rgba(27,27,30,.5);border:1px solid rgba(63,63,70,.3);border-radius:8px;padding:8px 10px;margin-bottom:6px">';
        html += '<div style="font-size:.72rem;font-weight:600;color:' + cc + ';margin-bottom:6px">Coro ' + coro + (coroNameA || coroNameB ? ' — ' + esc(coroNameA || coroNameB) : '') + '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
        // Part A
        html += '<div style="background:rgba(27,27,30,.4);border:1px solid rgba(63,63,70,.2);border-radius:6px;padding:6px">';
        html += '<div style="font-size:.6rem;color:#71717a;margin-bottom:4px;font-weight:600">Parte A</div>';
        if (audioA && audioA.audio_url) {
            html += '<div style="display:flex;align-items:center;gap:6px">';
            html += '<button class="btn-icon" data-vocal-key="' + audioKey + '_a" onclick="playVocalAudio(\'' + audioKey + '_a\',\'' + audioA.audio_url + '\')" style="color:#4ade80" title="Reproducir"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';
            html += '<div style="flex:1;min-width:0;font-size:.65rem;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(audioA.vocalista_name || coroNameA || 'Audio') + '</div>';
            if (canEditVocals()) {
                html += '<button class="btn-icon btn-icon-red" onclick="deleteVocalAudio(\'' + vocalEditorRepId + '\',\'' + vocalEditorSongId + '\',' + coro + ',\'' + sourceSongId + '\',\'' + day + '\',\'a\')" style="flex-shrink:0" title="Eliminar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
            }
            html += '</div>';
        } else {
            html += '<div style="font-size:.65rem;color:#52525b;font-style:italic">Sin audio</div>';
            if (canEditVocals()) {
                html += '<button class="btn-icon" onclick="triggerVocalAudioUpload(\'' + vocalEditorRepId + '\',\'' + vocalEditorSongId + '\',' + coro + ',\'' + sourceSongId + '\',\'' + day + '\',\'a\')" style="color:' + dayColor + ';margin-top:2px" title="Subir audio A"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>';
            }
        }
        html += '</div>';
        // Part B
        html += '<div style="background:rgba(27,27,30,.4);border:1px solid rgba(63,63,70,.2);border-radius:6px;padding:6px">';
        html += '<div style="font-size:.6rem;color:#71717a;margin-bottom:4px;font-weight:600">Parte B</div>';
        if (audioB && audioB.audio_url) {
            html += '<div style="display:flex;align-items:center;gap:6px">';
            html += '<button class="btn-icon" data-vocal-key="' + audioKey + '_b" onclick="playVocalAudio(\'' + audioKey + '_b\',\'' + audioB.audio_url + '\')" style="color:#4ade80" title="Reproducir"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';
            html += '<div style="flex:1;min-width:0;font-size:.65rem;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(audioB.vocalista_name || coroNameB || 'Audio') + '</div>';
            if (canEditVocals()) {
                html += '<button class="btn-icon btn-icon-red" onclick="deleteVocalAudio(\'' + vocalEditorRepId + '\',\'' + vocalEditorSongId + '\',' + coro + ',\'' + sourceSongId + '\',\'' + day + '\',\'b\')" style="flex-shrink:0" title="Eliminar"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
            }
            html += '</div>';
        } else {
            html += '<div style="font-size:.65rem;color:#52525b;font-style:italic">Sin audio</div>';
            if (canEditVocals()) {
                html += '<button class="btn-icon" onclick="triggerVocalAudioUpload(\'' + vocalEditorRepId + '\',\'' + vocalEditorSongId + '\',' + coro + ',\'' + sourceSongId + '\',\'' + day + '\',\'b\')" style="color:' + dayColor + ';margin-top:2px" title="Subir audio B"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>';
            }
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

function switchVocalTab(tab) {
    const vocesTab = document.getElementById('vocal-tab-voces');
    const audiosTab = document.getElementById('vocal-tab-audios');
    const btnVoces = document.getElementById('vtab-voces');
    const btnAudios = document.getElementById('vtab-audios');
    if (tab === 'voces') {
        vocesTab.style.display = '';
        audiosTab.style.display = 'none';
        btnVoces.classList.add('active');
        btnAudios.classList.remove('active');
    } else {
        vocesTab.style.display = 'none';
        audiosTab.style.display = '';
        btnVoces.classList.remove('active');
        btnAudios.classList.add('active');
        // Re-render audio list when switching to audios tab
        renderVocalAudioList(vocalEditorContextDay);
    }
}

function hideVocalEditor() {
    document.getElementById('vocal-editor-modal').classList.add('hidden');
    document.getElementById('vocal-input-main').value = '';
    vocalEditorDay = 'ambos';
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i);
        if (el) el.value = '';
        const elB = document.getElementById('vocal-coro-' + i + 'b');
        if (elB) elB.value = '';
    }
}

async function saveVocalEditor() {
    const mainName = document.getElementById('vocal-input-main').value.trim() || 'Por asignar';
    const isDom = vocalEditorContextDay === 'domingo';

    const coros = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i);
        if (el && el.value.trim()) coros.push(el.value.trim());
    }
    // Collect part B coro names
    const corosB = [];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById('vocal-coro-' + i + 'b');
        if (el && el.value.trim()) corosB.push(el.value.trim());
    }

    const localSong = songs.find(x => x.id === vocalEditorSongId);
    if (localSong) {
        if (isDom) {
            localSong.vocalista_domingo = mainName;
            localSong.coros_domingo = coros;
            localSong.coros_domingo_b = corosB;
        } else {
            localSong.vocalista_lunes = mainName;
            localSong.coros_lunes = coros;
            localSong.coros_lunes_b = corosB;
        }
        save('cb_songs', songs);
    }

    if (vocalEditorMode === 'add') {
        const s = songs.find(x => x.id === vocalEditorSongId);
        const r = repertorios.find(x => x.id === vocalEditorRepId);
        if (!s || !r) return;
        const orden = r.canciones.length + 1;
        const id = 'rs' + Date.now().toString(36);
        const dia = vocalEditorDay !== 'ambos' ? vocalEditorDay : (isDom ? 'domingo' : 'lunes');
        const insertData = {
            id,
            repertorio_id: vocalEditorRepId,
            titulo: s.title,
            artista: s.artist,
            dia,
            orden,
            tono_original: s.originalKey,
            tempo: s.tempo || 0,
            compas: s.compas || '',
            duracion: '0:00',
            letra_acordes: s.lyrics,
            audio_url: s.audio_url || null,
            source_song_id: s.id,
            created_by: s.createdBy || '',
            created_at: Date.now()
        };
        if (isDom) {
            insertData.vocalista_domingo = mainName;
            insertData.coros_domingo = coros;
            insertData.coros_domingo_b = corosB;
            insertData.vocalista_lunes = '';
            insertData.coros_lunes = [];
            insertData.coros_lunes_b = [];
        } else {
            insertData.vocalista_lunes = mainName;
            insertData.coros_lunes = coros;
            insertData.coros_lunes_b = corosB;
            insertData.vocalista_domingo = '';
            insertData.coros_domingo = [];
            insertData.coros_domingo_b = [];
        }
        try {
            const { error } = await supabaseClient.from('canciones_repertorio').insert(insertData);
            if (error) throw error;
            document.getElementById('rep-song-picker').innerHTML = '';
            await loadRepertorios();
            renderRepertorios();
            hideVocalEditor();
        } catch (e) { alert('Error al guardar: ' + e.message) }
    } else {
        const updateData = {};
        if (isDom) {
            updateData.vocalista_domingo = mainName;
            updateData.coros_domingo = coros;
            updateData.coros_domingo_b = corosB;
        } else {
            updateData.vocalista_lunes = mainName;
            updateData.coros_lunes = coros;
            updateData.coros_lunes_b = corosB;
        }
        try {
            const { error } = await supabaseClient.from('canciones_repertorio').update(updateData).eq('id', vocalEditorSongId);
            if (error) throw error;
            await loadRepertorios();
            renderRepertorioView();
            hideVocalEditor();
        } catch (e) { alert('Error al guardar: ' + e.message) }
    }
logActivity('vocals_assigned', {
    day: vocalEditorContextDay,
    main: mainName,
    coros: coros,
    mode: vocalEditorMode
}, 'song', vocalEditorSongId);
}

// ============= VOCAL AUDIO UPLOAD =============
function triggerVocalAudioUpload(repId, songId, coro, sourceSongId, dia, part) {
    if (!canEditVocals()) return;
    vocalAudioUploadRepId = repId;
    vocalAudioUploadSongId = songId;
    vocalAudioUploadSourceSongId = sourceSongId || null;
    vocalAudioUploadCoro = coro;
    vocalAudioUploadDia = dia || 'domingo';
    vocalAudioUploadPart = part || 'a';
    document.getElementById('vocal-audio-upload-input').click();
}

async function handleVocalAudioUpload(e) {
    const file = e.target.files[0];
    if (!file || !vocalAudioUploadRepId || !vocalAudioUploadSongId || !vocalAudioUploadCoro) return;
    if (!supabaseReady) { alert('Sin conexión a Supabase'); return }

    let sourceSongId = vocalAudioUploadSourceSongId;
    if (!sourceSongId) {
        try {
            const { data: crData } = await supabaseClient.from('canciones_repertorio').select('source_song_id').eq('id', vocalAudioUploadSongId).single();
            if (crData && crData.source_song_id) sourceSongId = crData.source_song_id;
        } catch (e) {}
    }
    if (!sourceSongId) {
        const r = repertorios.find(x => x.id === vocalAudioUploadRepId);
        const cancionesRep = r ? r.canciones.find(x => x.id === vocalAudioUploadSongId) : null;
        if (cancionesRep && cancionesRep.source_song_id) sourceSongId = cancionesRep.source_song_id;
    }
    if (!sourceSongId) {
        alert('No se pudo determinar el ID de la canción. Asegúrate de que la canción esté en tu biblioteca.');
        e.target.value = '';
        return;
    }

    const filename = sourceSongId + '_coro' + vocalAudioUploadCoro + '_' + (vocalAudioUploadPart || 'a') + '_' + vocalAudioUploadDia + '.mp3';
    const storagePath = 'vocal-audios/' + filename;

    // ✅ PRIMERO: Verificar si ya existe un audio para este coro en la base de datos
    let existingAudio = null;
    try {
        const { data: existingRows } = await supabaseClient
            .from('vocal_audios')
            .select('*')
            .eq('source_song_id', sourceSongId)
            .eq('coro_number', vocalAudioUploadCoro)
            .eq('dia', vocalAudioUploadDia)
            .eq('part', vocalAudioUploadPart || 'a')
            .maybeSingle();
        
        if (existingRows) {
            existingAudio = existingRows;
            console.log('📌 Audio existente encontrado:', existingAudio);
        }
    } catch (e) {
        console.warn('⚠️ Error verificando audio existente:', e.message);
    }

    try {
        // ✅ SOLO eliminar si existe audio previo
        if (existingAudio) {
            // Eliminar de R2
            if (existingAudio.audio_url) {
                try {
                    let path = existingAudio.audio_url;
                    if (path.includes('supabase.co')) {
                        const match = path.match(/\/storage\/v1\/object\/public\/([^?]+)/);
                        if (match) path = match[1];
                    } else {
                        path = extractR2Key(path);
                    }
                    const deleteUrl = getR2DeleteUrl(path);
                    await fetch(deleteUrl, { method: 'DELETE' });
                    console.log('✅ Audio vocal anterior eliminado de R2:', path);
                } catch (e) {
                    console.warn('⚠️ No se pudo eliminar audio_url anterior:', e.message);
                }
            }
            if (existingAudio.audio_path) {
                try {
                    const deleteUrl = getR2DeleteUrl(existingAudio.audio_path);
                    await fetch(deleteUrl, { method: 'DELETE' });
                    console.log('✅ Audio vocal anterior (path) eliminado de R2:', existingAudio.audio_path);
                } catch (e) {
                    console.warn('⚠️ No se pudo eliminar audio_path anterior:', e.message);
                }
            }
        }

        const renamedFile = new File([file], filename, { type: file.type || 'audio/mpeg' });
        const formData = new FormData();
        formData.append('file', renamedFile);
        formData.append('folder', 'vocal-audios');
        formData.append('filename', filename);
        const uploadRes = await fetch(R2_WORKER_URL + '/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error);
        let audioUrl = uploadData.url;
        if (audioUrl) audioUrl = normalizeVocalAudioUrl(audioUrl);

        // ✅ Extraer el R2 key real de la URL del worker (incluye timestamp)
        // para que coincida con el archivo subido a R2
        let actualStoragePath = storagePath;
        if (uploadData.url) {
            const r2Key = extractR2Key(uploadData.url);
            if (r2Key && r2Key !== storagePath) {
                actualStoragePath = r2Key;
                console.log('📎 R2 key real:', actualStoragePath, '(original:', storagePath, ')');
            }
        }

        if (!audioUrl || !audioUrl.includes(sourceSongId)) {
            audioUrl = SUPABASE_URL + '/storage/v1/object/public/vocal-audios/' + storagePath;
        }
        audioUrl = normalizeVocalAudioUrl(audioUrl);

        // ✅ Si existe, actualizar; si no, insertar
        if (existingAudio && existingAudio.id) {
            const { error: dbErr } = await supabaseClient
                .from('vocal_audios')
                .update({
                    audio_url: audioUrl,
                    audio_path: actualStoragePath,
                    updated_at: Date.now()
                })
                .eq('id', existingAudio.id);
            if (dbErr) throw dbErr;
        } else {
            const { error: dbErr } = await supabaseClient
                .from('vocal_audios')
                .insert({
                    cancion_repertorio_id: vocalAudioUploadSongId,
                    repertorio_id: vocalAudioUploadRepId,
                    source_song_id: sourceSongId,
                    coro_number: vocalAudioUploadCoro,
                    dia: vocalAudioUploadDia,
                    part: vocalAudioUploadPart || 'a',
                    vocalista_name: '',
                    audio_url: audioUrl,
                    audio_path: actualStoragePath,
                    updated_at: Date.now()
                });
            if (dbErr) throw dbErr;
        }

        await loadRepertorios();
        renderRepertorioView();
        showNotification('Audio del Coro ' + vocalAudioUploadCoro + ' parte ' + (vocalAudioUploadPart || 'a').toUpperCase() + ' guardado', 'success');
    } catch (err) {
        alert('Error al subir audio: ' + err.message);
    }

    logActivity('audio_uploaded', {
        type: 'vocal',
        coro: vocalAudioUploadCoro,
        dia: vocalAudioUploadDia
    }, 'vocal', sourceSongId);

    e.target.value = '';
    vocalAudioUploadCoro = null;
    vocalAudioUploadRepId = null;
    vocalAudioUploadSongId = null;
    vocalAudioUploadSourceSongId = null;
    vocalAudioUploadPart = 'a';
}

async function deleteVocalAudio(repId, songId, coro, sourceSongId, dia, part) {
    if (!canEditVocals()) return;
    if (!confirm('¿Eliminar este audio de coro?')) return;
    const audioPart = part || 'a';

    let resolvedSourceId = sourceSongId;
    if (!resolvedSourceId) {
        try {
            const { data: crData } = await supabaseClient.from('canciones_repertorio').select('source_song_id').eq('id', songId).single();
            if (crData && crData.source_song_id) resolvedSourceId = crData.source_song_id;
        } catch (e) {}
    }
    if (!resolvedSourceId) {
        const r = repertorios.find(x => x.id === repId);
        if (r) {
            const cancionesRep = r.canciones.find(x => x.id === songId);
            if (cancionesRep && cancionesRep.source_song_id) resolvedSourceId = cancionesRep.source_song_id;
        }
    }
    if (!resolvedSourceId) { resolvedSourceId = songId }

    const r = repertorios.find(x => x.id === repId);
    if (!r || !r.vocalAudios) return;

    const existing = r.vocalAudios.find(va => (va.source_song_id || va.cancion_repertorio_id) === resolvedSourceId && va.coro_number === coro && va.dia === dia && (va.part || 'a') === audioPart);
    if (!existing) return;

    try {
        // --- Eliminar de R2 correctamente ---
        if (existing.audio_url) {
            try {
                let path = existing.audio_url;
                // Si es URL de Supabase, extrae la ruta
                if (path.includes('supabase.co')) {
                    const match = path.match(/\/storage\/v1\/object\/public\/([^?]+)/);
                    if (match) path = match[1];
                } else {
                    path = extractR2Key(path);
                }
                
                // Usar la función helper para construir la URL correcta
                const deleteUrl = getR2DeleteUrl(path);
                console.log('📤 Eliminando audio vocal:', deleteUrl);
                
                const response = await fetch(deleteUrl, { method: 'DELETE' });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn('⚠️ No se pudo eliminar de R2:', response.status, errorText);
                } else {
                    console.log('✅ Audio vocal eliminado de R2:', path);
                }
            } catch (e) {
                console.warn('⚠️ Error eliminando audio vocal de R2:', e.message);
            }
        }
        
        if (existing.audio_path) {
            try {
                const deleteUrl = getR2DeleteUrl(existing.audio_path);
                console.log('📤 Eliminando audio vocal (path):', deleteUrl);
                
                const response = await fetch(deleteUrl, { method: 'DELETE' });
                
                if (!response.ok) {
                    console.warn('⚠️ No se pudo eliminar audio_path de R2:', response.status);
                } else {
                    console.log('✅ Audio vocal (path) eliminado de R2:', existing.audio_path);
                }
            } catch (e) {
                console.warn('⚠️ Error eliminando audio_path de R2:', e.message);
            }
        }

        // Eliminar TODOS los registros duplicados de la base de datos (no solo uno)
        await supabaseClient.from('vocal_audios')
            .delete()
            .eq('source_song_id', resolvedSourceId)
            .eq('coro_number', coro)
            .eq('dia', dia)
            .eq('part', audioPart);
        await loadRepertorios();
        renderRepertorioView();
        showNotification('Audio eliminado', 'success');
        
        logActivity('audio_deleted', {
            type: 'vocal',
            coro: coro,
            dia: dia
        }, 'vocal', resolvedSourceId);
        
    } catch (err) {
        console.error('❌ Error:', err);
        alert('Error al eliminar: ' + err.message);
    }
}

// ============= PAGE NAVIGATION =============
function showPage(name) {
    stopAllAudio();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('page-' + name);
    if (pg) pg.classList.add('active');
    const nb = document.getElementById('nav-' + name);
    if (nb) nb.classList.add('active');
    if (name === 'library') renderLibrary();
    if (name === 'lists') renderLists();
    if (name === 'repertorios') { showConnectionStatus();
        loadRepertorios().then(() => renderRepertorios()) }
    if (name === 'repertorio') renderRepertorioView();
    if (name === 'rep-song') renderRepSongView();
    if (name === 'add') { if (!editingSongId) resetForm();
        renderKeyGrid() }
    if (name === 'view') renderView();
    if (name === 'listview') renderListView();
}

// ============= SEARCH =============
document.getElementById('search-input').addEventListener('input', renderLibrary);

// ============= KEYBOARD SHORTCUTS =============
document.addEventListener('keydown', function(e) {
    // Escape to close modals
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.auth-modal.active, #import-confirm-modal, #vocal-editor-modal');
        modals.forEach(m => {
            if (m.id === 'auth-modal') closeAuthModal();
            else if (m.id === 'import-confirm-modal') closeImportConfirmModal();
            else if (m.id === 'vocal-editor-modal') hideVocalEditor();
        });
    }
});

// ============= AUDIO UPLOAD INPUTS =============
document.getElementById('audio-upload-input').addEventListener('change', handleAudioUpload);
document.getElementById('vocal-audio-upload-input').addEventListener('change', handleVocalAudioUpload);

// ============= INIT =============
showConnectionStatus();
loadRepertorios().then(() => renderLibrary());

// ============= PWA =============
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
    showInstallFloat()
});

function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 }

function isStandalone() { return window.matchMedia('(display-mode:standalone)').matches || window.navigator.standalone === true }

function showInstallFloat() {
    if (isStandalone()) return;
    const btn = document.getElementById('install-float-btn');
    if (btn) btn.style.display = 'flex'
}

function handleInstallClick() {
    if (isIOS()) { document.getElementById('ios-install-modal').style.display = 'flex' } else { installApp() }
}

function showInstallBanner() {
    if (!deferredPrompt) return;
    const c = document.getElementById('install-banner-container');
    if (c && !c.innerHTML) {
        c.innerHTML = '<div class="install-banner" onclick="installApp()"><div style="font-size:24px">📱</div><div class="install-banner-text"><div class="install-banner-title">Instalar Repertorios RL</div><div class="install-banner-desc">Añadir a pantalla de inicio para usar como app</div></div><button class="install-banner-btn">Instalar</button></div>';
        showInstallFloat()
    }
}

async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('install-banner-container').innerHTML = '';
    document.getElementById('install-float-btn').style.display = 'none'
}

window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner-container').innerHTML = '';
    document.getElementById('install-float-btn').style.display = 'none';
    deferredPrompt = null
});

if (isIOS() && !isStandalone()) {
    setTimeout(() => {
        const btn = document.getElementById('install-float-btn');
        if (btn) btn.style.display = 'flex'
    }, 2000)
}

// ============= SERVICE WORKER =============
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js').then(function(registration) {
            console.log('[PWA] Service Worker registered, scope:', registration.scope);
            setInterval(function() { registration.update() }, 10000);
            registration.addEventListener('updatefound', function() {
                var newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', function() {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (confirm('Hay una nueva versión disponible. ¿Actualizar ahora?')) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                window.location.reload();
                            }
                        }
                    });
                }
            });
        }).catch(function(err) {
            console.log('[PWA] Service Worker registration failed:', err);
        });
    });
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (!refreshing) { refreshing = true;
            window.location.reload() }
    });
}
