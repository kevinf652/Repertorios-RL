// ============================================================
// CONFIGURACIÓN
// ============================================================
const SUPABASE_URL = 'https://vkafuvslrpwfevkfzxyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrYWZ1dnNscnB3ZmV2a2Z6eHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzkzOTAsImV4cCI6MjEwMjQxNTM5MH0.jTKSLHb5RaYbXlBEQgWpEntfzzvIBI6esSdNzm58nek';
const R2_WORKER_URL = 'https://repertorios-r2-api.kevinf652.workers.dev';

// ============================================================
// FUNCIONES DE UTILIDAD
// ============================================================
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9) }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

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

// ============================================================
// TONOS Y TRANSPOSICIÓN
// ============================================================
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

let useFlats = load('cb_use_flats', false);

function dn(note) { if (!note) return ''; const idx = NOTE_MAP[note]; if (idx === undefined) return note; return useFlats ? FLATS[idx] : SHARPS[idx] }
function displayChord(c) { return c.replace(/([A-G][#b]?)/g, (match) => { const idx = NOTE_MAP[match]; if (idx === undefined) return match; return useFlats ? FLATS[idx] : SHARPS[idx] }) }
function transposeChord(chord, semitones) { return chord.replace(/([A-G][#b]?)/g, (match) => { const idx = NOTE_MAP[match]; if (idx === undefined) return match; const newIdx = (idx + semitones + 1200) % 12; return useFlats ? FLATS[newIdx] : SHARPS[newIdx] }) }
function transposeLine(line, semitones) { return line.replace(/\[([^\]]+)\]/g, (_, chord) => '[' + transposeChord(chord, semitones) + ']') }
function getS(fromKey, toKey) { const fi = NOTE_MAP[fromKey]; const ti = NOTE_MAP[toKey]; if (fi === undefined || ti === undefined) return 0; return (ti - fi + 12) % 12 }
function detectKey(ly) { const c = {}; let m; const r = /\[([^\]]+)\]/g; while ((m = r.exec(ly)) !== null) { const rm = m[1].match(/^([A-G][#b]?)/); if (rm) { const k = rm[1]; c[k] = (c[k] || 0) + 1 } } let mx = 0, dk = 'C'; for (const [k, v] of Object.entries(c)) { if (v > mx) { mx = v; dk = k } } return dk }
function toggleNotation() { useFlats = !useFlats; save('cb_use_flats', useFlats); const btns = document.querySelectorAll('#notation-toggle,#lib-notation-toggle'); btns.forEach(b => b.innerHTML = useFlats ? '♭' : '#'); renderLibrary() }

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

function formatTime(s) { if (!s || isNaN(s)) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return m + ':' + (sec < 10 ? '0' : '') + sec }

// ============================================================
// DATOS GLOBALES
// ============================================================
let songs = load('cb_songs', []);
let lists = load('cb_lists', []);
let repertorios = [];
let currentUser = null;
let viewingSongId = null;
let viewingListId = null;
let viewReturnTo = null;
let listNavIndex = 0;
let editingSongId = null;
let formTags = [];
let formKey = 'C';
let supabaseReady = false;
let supabaseClient = null;

// ============================================================
// SUPABASE INICIALIZACIÓN
// ============================================================
try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseReady = true;
        console.log('✅ Supabase conectado');
    }
} catch (e) { console.error('❌ Supabase init error:', e) }

// ============================================================
// NOTIFICACIONES
// ============================================================
function showNotification(message, type) {
    const existing = document.querySelector('.floating-notification');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'floating-notification';
    div.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 12px 20px; border-radius: 12px; font-size: .85rem;
        font-weight: 500; z-index: 9999; animation: slideDown .3s ease;
        box-shadow: 0 10px 25px rgba(0,0,0,.3);
        background: ${type === 'success' ? 'rgba(34,197,94,.9)' : 'rgba(248,113,113,.9)'};
        color: #fff;
    `;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .3s'; setTimeout(() => div.remove(), 300); }, 3000);
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('page-' + name);
    if (pg) pg.classList.add('active');
    const nb = document.getElementById('nav-' + name);
    if (nb) nb.classList.add('active');
    if (name === 'library') renderLibrary();
    if (name === 'lists') renderLists();
    if (name === 'add') { if (!editingSongId) resetForm(); renderKeyGrid() }
    if (name === 'view') renderView();
    if (name === 'listview') renderListView();
}

function goBackFromView() {
    if (viewReturnTo === 'listview') { showPage('listview') } else { showPage('library') }
}

// ============================================================
// RENDER: BIBLIOTECA
// ============================================================
function renderLibrary() {
    const listEl = document.getElementById('song-list');
    if (!listEl) return;
    const countEl = document.getElementById('song-count');
    if (countEl) countEl.textContent = songs.length + ' canciones';

    if (songs.length === 0) {
        listEl.innerHTML = `
            <div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>Sin canciones aún</h2><p>Agrega tu primera canción o importa archivos</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-amber" onclick="showPage('add')">Agregar canción</button><button class="btn btn-zinc" onclick="document.getElementById('import-input').click()">Importar archivo</button></div></div>
        `;
        return;
    }

    const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));

    listEl.innerHTML = sorted.map(s => `
        <div class="card" onclick="viewSong('${s.id}')" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="flex:1;min-width:0">
                    <div class="card-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        ${esc(s.title)}
                    </div>
                    <div class="card-artist">${esc(s.artist || 'Desconocido')}</div>
                    <div class="card-meta">
                        <span class="tag tag-key">${dn(s.originalKey || 'C')}</span>
                        ${s.tempo ? `<span class="tag tag-zinc">${s.tempo} BPM</span>` : ''}
                        ${s.compas ? `<span class="tag tag-zinc">${s.compas}</span>` : ''}
                        ${s.tags ? s.tags.slice(0, 2).map(t => `<span class="tag tag-zinc">${esc(t)}</span>`).join('') : ''}
                        ${s.audio_url ? '<span class="tag" style="background:rgba(34,197,94,.2);color:#4ade80">🎵 Audio</span>' : ''}
                    </div>
                </div>
                <button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteSong('${s.id}')" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// RENDER: LISTAS
// ============================================================
function renderLists() {
    const listEl = document.getElementById('list-list');
    if (!listEl) return;
    const countEl = document.getElementById('list-count');
    if (countEl) countEl.textContent = lists.length + ' listas';

    if (lists.length === 0) {
        listEl.innerHTML = `
            <div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div><h2>Sin listas aún</h2><p>Crea listas para organizar tus canciones</p><button class="btn btn-amber" onclick="showNewListForm()">Crear primera lista</button></div>
        `;
        return;
    }

    listEl.innerHTML = lists.map(l => `
        <div class="card" onclick="viewList('${l.id}')" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between">
                <div style="flex:1">
                    <div class="card-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
                        ${esc(l.name)}
                    </div>
                    ${l.description ? `<p style="font-size:.7rem;color:#71717a;margin-left:20px">${esc(l.description)}</p>` : ''}
                    <div style="display:flex;gap:6px;margin-top:6px;margin-left:20px">
                        <span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> ${l.songIds ? l.songIds.length : 0} canciones</span>
                    </div>
                </div>
                <button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteList('${l.id}')" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// RENDER: VER CANCIÓN
// ============================================================
function renderView() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;

    const infoEl = document.getElementById('view-song-info');
    if (infoEl) {
        infoEl.innerHTML = `
            <h1 style="font-size:1.1rem;font-weight:700;color:#fff">${esc(s.title)}</h1>
            <p style="font-size:.8rem;color:#a1a1aa">${esc(s.artist || 'Desconocido')}</p>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                <span class="tag tag-key">${dn(s.originalKey || 'C')}</span>
                ${s.tempo ? `<span class="tag tag-zinc">${s.tempo} BPM</span>` : ''}
                ${s.compas ? `<span class="tag tag-zinc">${s.compas}</span>` : ''}
            </div>
        `;
    }

    const keySelector = document.getElementById('view-key-selector');
    if (keySelector) {
        keySelector.innerHTML = `
            <button class="key-btn" onclick="changeKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button>
            <button id="lib-notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24">${useFlats ? '♭' : '#'}</button>
            <div class="key-display"><div class="key-note">${dn(s.currentKey || s.originalKey || 'C')}</div></div>
            <button class="key-btn" onclick="changeKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>
        `;
    }

    const lyricsEl = document.getElementById('view-lyrics');
    if (lyricsEl) {
        const semi = getS(s.originalKey || 'C', s.currentKey || s.originalKey || 'C');
        lyricsEl.innerHTML = (s.lyrics || '').split('\n').map(line => {
            const t = semi !== 0 ? transposeLine(line, semi) : line;
            if (/\[[^\]]+\]/.test(t)) {
                let h = '<div class="lyrics-line">' + t.replace(/\[([^\]]+)\]/g, (m, p1) => '<span class="chord">' + displayChord(p1) + '</span>');
                h = h.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>');
                h = h.replace(/\s*\{\d+\}/g, '');
                return h + '</div>';
            }
            if (/\([^)]+\)/.test(line)) {
                var _dl = line.replace(/\s*\{\d+\}/g, '');
                return '<div class="lyrics-line">' + _dl.replace(/\(([^)]+)\)/g, '<span class="lyrics-section">$1</span>') + '</div>';
            }
            return '<div class="lyrics-line">' + (line || '&nbsp;') + '</div>';
        }).join('');
    }
}

function changeKey(delta) {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    const currentIdx = NOTE_MAP[s.currentKey || s.originalKey || 'C'] ?? 0;
    const newIdx = (currentIdx + delta + 12) % 12;
    s.currentKey = useFlats ? FLATS[newIdx] : SHARPS[newIdx];
    save('cb_songs', songs);
    renderView();
}

// ============================================================
// RENDER: VER LISTA
// ============================================================
function renderListView() {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) return;

    const listSongs = l.songIds ? l.songIds.map(sid => songs.find(s => s.id === sid)).filter(Boolean) : [];

    const headerEl = document.getElementById('listview-header');
    if (headerEl) {
        headerEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;background:rgba(245,158,11,.2);border-radius:10px;display:flex;align-items:center;justify-content:center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div>
                    <h1 style="font-size:1.1rem;font-weight:700;color:#fff">${esc(l.name)}</h1>
                    ${l.description ? `<p style="font-size:.7rem;color:#71717a">${esc(l.description)}</p>` : ''}
                    <p style="font-size:.7rem;color:#71717a">${listSongs.length} canciones</p>
                </div>
            </div>
        `;
    }

    const container = document.getElementById('listview-songs');
    if (!container) return;

    if (listSongs.length === 0) {
        container.innerHTML = `
            <div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>Lista vacía</h2><p>Añade canciones desde la biblioteca</p><button class="btn btn-amber" onclick="showPage('library')">Ir a biblioteca</button></div>
        `;
        return;
    }

    container.innerHTML = listSongs.map(s => `
        <div class="card" onclick="viewSongFromList('${s.id}')" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="flex:1;min-width:0">
                    <div class="card-title">${esc(s.title)}</div>
                    <div class="card-artist">${esc(s.artist || 'Desconocido')}</div>
                    <div class="card-meta"><span class="tag tag-key">${dn(s.originalKey || 'C')}</span></div>
                </div>
                <button class="btn-icon btn-icon-red" onclick="event.stopPropagation();removeFromList('${s.id}')" title="Quitar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// ACCIONES DE LISTAS
// ============================================================
function showNewListForm() {
    const form = document.getElementById('new-list-form');
    if (form) form.classList.remove('hidden');
    const input = document.getElementById('input-list-name');
    if (input) input.focus();
}

function hideNewListForm() {
    const form = document.getElementById('new-list-form');
    if (form) form.classList.add('hidden');
    document.getElementById('input-list-name').value = '';
    document.getElementById('input-list-desc').value = '';
}

function createList() {
    const name = document.getElementById('input-list-name').value.trim();
    if (!name) return;
    const description = document.getElementById('input-list-desc').value.trim();
    lists.unshift({ id: genId(), name: name, description: description, songIds: [], createdAt: Date.now(), updatedAt: Date.now() });
    save('cb_lists', lists);
    hideNewListForm();
    renderLists();
    showNotification('📋 Lista "' + name + '" creada', 'success');
}

function confirmDeleteList(id) {
    if (!confirm('¿Eliminar esta lista?')) return;
    lists = lists.filter(l => l.id !== id);
    save('cb_lists', lists);
    renderLists();
    showNotification('Lista eliminada', 'success');
}

function viewList(id) {
    viewingListId = id;
    listNavIndex = 0;
    showPage('listview');
}

function viewSongFromList(id) {
    viewingSongId = id;
    viewReturnTo = 'listview';
    showPage('view');
}

function removeFromList(sid) {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) return;
    l.songIds = l.songIds.filter(id => id !== sid);
    save('cb_lists', lists);
    renderListView();
    showNotification('Canción removida de la lista', 'success');
}

// ============================================================
// ACCIONES DE CANCIONES
// ============================================================
function viewSong(id) {
    viewingSongId = id;
    viewReturnTo = null;
    showPage('view');
}

function editSong() {
    const s = songs.find(x => x.id === viewingSongId);
    if (!s) return;
    editingSongId = s.id;
    document.getElementById('form-title').textContent = 'Editar canción';
    document.getElementById('input-title').value = s.title;
    document.getElementById('input-artist').value = s.artist || '';
    document.getElementById('input-lyrics').value = s.lyrics || '';
    document.getElementById('input-tempo').value = s.tempo || '';
    document.getElementById('input-compas').value = s.compas || '';
    formKey = s.originalKey || 'C';
    formTags = s.tags ? [...s.tags] : [];
    renderFormTags();
    renderKeyGrid();
    showPage('add');
}

function confirmDeleteSong(id) {
    if (!confirm('¿Eliminar esta canción de tu biblioteca?')) return;
    songs = songs.filter(s => s.id !== id);
    lists.forEach(l => l.songIds = l.songIds.filter(sid => sid !== id));
    save('cb_songs', songs);
    save('cb_lists', lists);
    renderLibrary();
    showNotification('Canción eliminada', 'success');
}

// ============================================================
// FORMULARIO DE CANCIONES
// ============================================================
function renderKeyGrid() {
    document.getElementById('key-grid-form').innerHTML = KEY_VALUES.map((k, i) =>
        '<button class="key-option ' + (formKey === k ? 'current' : 'other') + '" onclick="formKey=\'' + k + '\';renderKeyGrid()">' + KEY_NAMES[i] + '</button>'
    ).join('');
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
    document.getElementById('tag-list').innerHTML = formTags.map(t => '<span class="tag-item">' + esc(t) + ' <button class="tag-remove" onclick="removeFormTag(\'' + esc(t) + '\')">×</button></span>').join('');
}

function addTag() {
    const i = document.getElementById('input-tag'),
        t = i.value.trim();
    if (t && !formTags.includes(t)) { formTags.push(t);
        renderFormTags() }
    i.value = '';
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
            songs[i] = { ...songs[i], title: t, artist: a, lyrics: l, originalKey: formKey, tags: [...formTags], tempo: bpm || songs[i].tempo || 0, compas: cmp || songs[i].compas || '', audio_url: songs[i].audio_url || null, updatedAt: Date.now() };
        }
    } else {
        const dk = detectKey(l);
        songs.unshift({ id: genId(), title: t, artist: a, lyrics: l, originalKey: formKey || dk, currentKey: formKey || dk, tags: [...formTags], tempo: bpm, compas: cmp, audio_url: null, createdAt: Date.now(), updatedAt: Date.now() });
    }
    save('cb_songs', songs);
    editingSongId = null;
    showPage('library');
    showNotification('✅ Canción guardada', 'success');
}

// ============================================================
// MODAL DE CONFIRMACIÓN PARA IMPORTAR LISTAS
// ============================================================
function showImportConfirmModal(newSongs, listData, fileSongs) {
    const existingModal = document.getElementById('import-confirm-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'import-confirm-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,.8); z-index: 1000;
        display: flex; align-items: center; justify-content: center; padding: 20px;
        animation: fadeIn .25s ease;
    `;

    const existingCount = fileSongs.length - newSongs.length;

    modal.innerHTML = `
        <div style="background:#27272a;border-radius:16px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid rgba(63,63,70,.3);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="width:44px;height:44px;background:rgba(245,158,11,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">📥</div>
                <div>
                    <h3 style="font-size:1rem;font-weight:700;color:#fff">Importar lista</h3>
                    <p style="font-size:.8rem;color:#a1a1aa">${esc(listData.name || 'Lista importada')}</p>
                </div>
            </div>
            <div style="background:rgba(39,39,42,.4);border:1px solid rgba(63,63,70,.3);border-radius:10px;padding:14px;margin-bottom:16px">
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
                <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:12px;margin-bottom:16px;max-height:150px;overflow-y:auto">
                    <p style="font-size:.7rem;color:#fbbf24;font-weight:600;margin-bottom:6px">📋 Canciones nuevas:</p>
                    ${newSongs.slice(0,5).map(s => `<div style="font-size:.75rem;color:#d4d4d8;padding:2px 0">• ${esc(s.title || 'Sin título')} — ${esc(s.artist || 'Desconocido')}</div>`).join('')}
                    ${newSongs.length > 5 ? `<div style="font-size:.7rem;color:#71717a;margin-top:4px">Y ${newSongs.length - 5} más...</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                    <button class="btn btn-amber" onclick="confirmImportAll()" style="width:100%;padding:12px;font-weight:600;justify-content:center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:6px"><polyline points="20,6 9,17 4,12"/></svg>
                        Añadir todas (${newSongs.length})
                    </button>
                    <button class="btn btn-zinc" onclick="confirmImportLater()" style="width:100%;padding:12px;font-weight:600;background:rgba(39,39,46,.8);border:1px solid rgba(63,63,70,.5);justify-content:center">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                        Elegir después (una por una)
                    </button>
                </div>
            ` : `
                <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:12px;margin-bottom:16px;text-align:center">
                    <p style="font-size:.85rem;color:#4ade80">✅ ¡Todas las canciones ya están en tu biblioteca!</p>
                    <p style="font-size:.7rem;color:#71717a">La lista se creará sin duplicados</p>
                </div>
                <button class="btn btn-amber" onclick="confirmImportAll()" style="width:100%;padding:12px;font-weight:600;justify-content:center">Crear lista</button>
            `}
            <button onclick="closeImportConfirmModal()" style="width:100%;padding:10px;background:transparent;border:1px solid rgba(63,63,70,.3);border-radius:8px;color:#71717a;font-size:.8rem;cursor:pointer;margin-top:8px;transition:background .2s" onmouseover="this.style.background='rgba(63,63,70,.1)'" onmouseout="this.style.background='transparent'">Cancelar</button>
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

function confirmImportAll() {
    const pending = window._importPendingList;
    if (!pending) return;

    // Añadir TODAS las canciones nuevas
    pending.newSongs.forEach(s => {
        const songId = s.id || genId();
        const existing = songs.find(x => x.id === songId);
        if (!existing) {
            const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
            songs.push({
                id: songId,
                sourceId: s.id || null,
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

    // Crear o fusionar lista
    createOrMergeList(pending.listData, pending.fileSongs);

    closeImportConfirmModal();
    renderLists();
    renderLibrary();
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

function createOrMergeList(listData, fileSongs, pendingOnly = false) {
    const allSongIds = fileSongs.map(s => s.id || genId());
    const existingList = lists.find(l => l.name === listData.name);

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

// ============================================================
// IMPORTACIÓN DE LISTAS (EVENT LISTENER MEJORADO)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM cargado');

    // ============================================================
    // IMPORTAR CANCIONES
    // ============================================================
    const importInput = document.getElementById('import-input');
    if (importInput) {
        importInput.addEventListener('change', function(e) {
            const files = e.target.files;
            if (!files || !files.length) return;
            let total = 0;
            for (const file of Array.from(files)) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    const content = ev.target.result;
                    const ext = file.name.split('.').pop().toLowerCase();
                    if (ext === 'txt') {
                        const parsed = parseSongFilename(file.name);
                        const dk = parsed.key ? parsed.key : (content ? detectKey(content) : 'C');
                        songs.push({ id: genId(), title: parsed.title || 'Sin título', artist: parsed.artist || 'Desconocido', lyrics: content.trim() || '', originalKey: dk, currentKey: dk, tempo: parsed.bpm || 0, compas: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() });
                        total++;
                        save('cb_songs', songs);
                        renderLibrary();
                        showNotification(total + ' canciones importadas', 'success');
                    } else if (ext === 'json') {
                        try {
                            const d = JSON.parse(content);
                            if (d.type === 'chordbook-song' && Array.isArray(d.songs)) {
                                d.songs.forEach(s => {
                                    const songId = s.id || genId();
                                    const existing = songs.find(x => x.id === songId);
                                    if (!existing) {
                                        const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
                                        songs.push({ id: songId, title: s.title || 'Sin título', artist: s.artist || 'Desconocido', lyrics: s.lyrics || '', originalKey: dk, currentKey: dk, tempo: s.tempo || 0, compas: s.compas || '', tags: s.tags || [], audio_url: s.audio_url || null, createdAt: s.createdAt || Date.now(), updatedAt: Date.now(), createdBy: s.createdBy || '' });
                                        total++;
                                    }
                                });
                                save('cb_songs', songs);
                                renderLibrary();
                                showNotification(total + ' canciones importadas', 'success');
                            }
                        } catch (e) { console.error('Error parsing JSON:', e); }
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });
    }

    // ============================================================
    // IMPORTAR LISTAS (CON MODAL DE CONFIRMACIÓN)
    // ============================================================
    const importListInput = document.getElementById('import-list-input');
    if (importListInput) {
        importListInput.addEventListener('change', function(e) {
            const files = e.target.files;
            if (!files || !files.length) return;

            let hasPending = false;

            for (const file of Array.from(files)) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        const d = JSON.parse(ev.target.result);

                        if (d.type === 'chordbook-list') {
                            const listName = d.list?.name || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Lista importada';
                            const listDescription = d.list?.description || '';
                            const fileSongs = d.songs || [];

                            // Detectar canciones nuevas
                            const newSongs = fileSongs.filter(s => {
                                const songId = s.id || genId();
                                return !songs.find(x => x.id === songId);
                            });

                            // Si hay canciones nuevas, mostrar modal
                            if (newSongs.length > 0) {
                                hasPending = true;
                                showImportConfirmModal(
                                    newSongs,
                                    { name: listName, description: listDescription },
                                    fileSongs
                                );
                            } else {
                                // Crear lista directamente
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
                                renderLists();
                            }
                        }
                    } catch (err) {
                        console.error('Error importing list:', err);
                        showNotification('❌ Error al importar: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            }

            e.target.value = '';
        });
    }

    // ============================================================
    // RENDER INICIAL
    // ============================================================
    renderLibrary();
    renderLists();
    console.log('✅ App inicializada correctamente');
});

console.log('✅ app.js cargado');