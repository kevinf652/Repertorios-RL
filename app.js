// ============================================================
// VERSIÓN SIMPLIFICADA PARA PRUEBA - app.js
// ============================================================

console.log('🚀 App cargando...');

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================
const SUPABASE_URL = 'https://vkafuvslrpwfevkfzxyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrYWZ1dnNscnB3ZmV2a2Z6eHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzkzOTAsImV4cCI6MjEwMjQxNTM5MH0.jTKSLHb5RaYbXlBEQgWpEntfzzvIBI6esSdNzm58nek';
const R2_WORKER_URL = 'https://repertorios-r2-api.kevinf652.workers.dev';

// ============================================================
// UTILIDADES BÁSICAS
// ============================================================
function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d } catch { return d } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9) }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

// ============================================================
// DATOS
// ============================================================
let songs = load('cb_songs', []);
let lists = load('cb_lists', []);
let repertorios = [];
let currentUser = null;
let viewingSongId = null;
let viewingListId = null;
let viewReturnTo = null;
let listNavIndex = 0;

// ============================================================
// TONOS
// ============================================================
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_MAP = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11, 'B#': 0
};

let useFlats = load('cb_use_flats', false);

function dn(note) {
    if (!note) return '';
    const idx = NOTE_MAP[note];
    if (idx === undefined) return note;
    return useFlats ? FLATS[idx] : SHARPS[idx];
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
    let mx = 0, dk = 'C';
    for (const [k, v] of Object.entries(c)) {
        if (v > mx) { mx = v; dk = k; }
    }
    return dk;
}

// ============================================================
// FUNCIONES DE NAVEGACIÓN
// ============================================================
function showPage(name) {
    console.log('📄 Mostrando página:', name);
    
    // Ocultar todas las páginas
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Mostrar la página solicitada
    const pg = document.getElementById('page-' + name);
    if (pg) {
        pg.classList.add('active');
        console.log('✅ Página mostrada:', name);
    } else {
        console.warn('⚠️ Página no encontrada:', name);
    }
    
    // Activar botón de navegación
    const nb = document.getElementById('nav-' + name);
    if (nb) nb.classList.add('active');
    
    // Renderizar contenido según página
    if (name === 'library') renderLibrary();
    if (name === 'lists') renderLists();
    if (name === 'view') renderView();
    if (name === 'listview') renderListView();
}

function goBackFromView() {
    if (viewReturnTo === 'listview') {
        showPage('listview');
    } else {
        showPage('library');
    }
}

// ============================================================
// RENDER: BIBLIOTECA
// ============================================================
function renderLibrary() {
    console.log('📚 Renderizando biblioteca, canciones:', songs.length);
    
    const listEl = document.getElementById('song-list');
    if (!listEl) {
        console.error('❌ No se encontró #song-list');
        return;
    }
    
    const countEl = document.getElementById('song-count');
    if (countEl) countEl.textContent = songs.length + ' canciones';
    
    if (songs.length === 0) {
        listEl.innerHTML = `
            <div class="empty">
                <div class="empty-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                </div>
                <h2>Sin canciones aún</h2>
                <p>Agrega tu primera canción o importa archivos</p>
                <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                    <button class="btn btn-amber" onclick="showPage('add')">Agregar canción</button>
                    <button class="btn btn-zinc" onclick="document.getElementById('import-input').click()">Importar archivo</button>
                </div>
            </div>
        `;
        return;
    }
    
    // Ordenar alfabéticamente
    const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    
    listEl.innerHTML = sorted.map(s => `
        <div class="card" onclick="viewSong('${s.id}')" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:8px">
                <div style="flex:1;min-width:0">
                    <div class="card-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                        </svg>
                        ${esc(s.title)}
                    </div>
                    <div class="card-artist">${esc(s.artist || 'Desconocido')}</div>
                    <div class="card-meta">
                        <span class="tag tag-key">${dn(s.originalKey || 'C')}</span>
                        ${s.tempo ? `<span class="tag tag-zinc">${s.tempo} BPM</span>` : ''}
                        ${s.compas ? `<span class="tag tag-zinc">${s.compas}</span>` : ''}
                        ${s.tags ? s.tags.slice(0, 2).map(t => `<span class="tag tag-zinc">${esc(t)}</span>`).join('') : ''}
                    </div>
                </div>
                <button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteSong('${s.id}')" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    console.log('✅ Biblioteca renderizada,', songs.length, 'canciones');
}

// ============================================================
// RENDER: LISTAS
// ============================================================
function renderLists() {
    console.log('📋 Renderizando listas, listas:', lists.length);
    
    const listEl = document.getElementById('list-list');
    if (!listEl) return;
    
    const countEl = document.getElementById('list-count');
    if (countEl) countEl.textContent = lists.length + ' listas';
    
    if (lists.length === 0) {
        listEl.innerHTML = `
            <div class="empty">
                <div class="empty-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    </svg>
                </div>
                <h2>Sin listas aún</h2>
                <p>Crea listas para organizar tus canciones</p>
                <button class="btn btn-amber" onclick="showNewListForm()">Crear primera lista</button>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = lists.map(l => `
        <div class="card" onclick="viewList('${l.id}')" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between">
                <div style="flex:1">
                    <div class="card-title">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                        </svg>
                        ${esc(l.name)}
                    </div>
                    ${l.description ? `<p style="font-size:.7rem;color:#71717a;margin-left:20px">${esc(l.description)}</p>` : ''}
                    <div style="display:flex;gap:6px;margin-top:6px;margin-left:20px">
                        <span class="tag-list">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                            </svg>
                            ${l.songIds ? l.songIds.length : 0} canciones
                        </span>
                    </div>
                </div>
                <button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteList('${l.id}')" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
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
    if (!s) {
        console.warn('⚠️ Canción no encontrada:', viewingSongId);
        return;
    }
    
    console.log('🎵 Renderizando canción:', s.title);
    
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
    
    const lyricsEl = document.getElementById('view-lyrics');
    if (lyricsEl) {
        lyricsEl.innerHTML = s.lyrics ? s.lyrics.split('\n').map(line => 
            `<div class="lyrics-line">${esc(line) || '&nbsp;'}</div>`
        ).join('') : '<div class="lyrics-line" style="color:#71717a;font-style:italic">Sin letra</div>';
    }
}

// ============================================================
// RENDER: VER LISTA
// ============================================================
function renderListView() {
    const l = lists.find(x => x.id === viewingListId);
    if (!l) {
        console.warn('⚠️ Lista no encontrada:', viewingListId);
        return;
    }
    
    console.log('📋 Renderizando lista:', l.name);
    
    const listSongs = l.songIds ? l.songIds.map(sid => songs.find(s => s.id === sid)).filter(Boolean) : [];
    
    const headerEl = document.getElementById('listview-header');
    if (headerEl) {
        headerEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;background:rgba(245,158,11,.2);border-radius:10px;display:flex;align-items:center;justify-content:center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
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
            <div class="empty">
                <div class="empty-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2">
                        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                    </svg>
                </div>
                <h2>Lista vacía</h2>
                <p>Añade canciones desde la biblioteca</p>
                <button class="btn btn-amber" onclick="showPage('library')">Ir a biblioteca</button>
            </div>
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
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
    
    lists.unshift({
        id: genId(),
        name: name,
        description: description,
        songIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    
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
// NOTIFICACIONES
// ============================================================
function showNotification(message, type) {
    console.log('📢 Notificación:', message);
    
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
        background: ${type === 'success' ? 'rgba(34,197,94,.9)' : 'rgba(248,113,113,.9)'};
        color: #fff;
    `;
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = 'opacity .3s';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// ============================================================
// MANEJO DE ARCHIVOS DE IMPORTACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM cargado, inicializando...');
    
    // Importar canciones
    const importInput = document.getElementById('import-input');
    if (importInput) {
        importInput.addEventListener('change', function(e) {
            console.log('📥 Importando archivos...');
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
                        songs.push({
                            id: genId(),
                            title: parsed.title || 'Sin título',
                            artist: parsed.artist || 'Desconocido',
                            lyrics: content.trim() || '',
                            originalKey: dk,
                            currentKey: dk,
                            tempo: parsed.bpm || 0,
                            compas: '',
                            tags: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });
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
                                        songs.push({
                                            id: songId,
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
                                        total++;
                                    }
                                });
                                save('cb_songs', songs);
                                renderLibrary();
                                showNotification(total + ' canciones importadas', 'success');
                            }
                        } catch(e) { console.error('Error parsing JSON:', e); }
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });
    }
    
    // Importar listas
    const importListInput = document.getElementById('import-list-input');
    if (importListInput) {
        importListInput.addEventListener('change', function(e) {
            console.log('📥 Importando lista...');
            const files = e.target.files;
            if (!files || !files.length) return;
            
            for (const file of Array.from(files)) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        const d = JSON.parse(ev.target.result);
                        if (d.type === 'chordbook-list' && d.list) {
                            const listName = d.list.name || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim() || 'Lista importada';
                            
                            // Importar canciones
                            if (d.songs && Array.isArray(d.songs)) {
                                d.songs.forEach(s => {
                                    const songId = s.id || genId();
                                    const existing = songs.find(x => x.id === songId);
                                    if (!existing) {
                                        const dk = s.originalKey || (s.lyrics ? detectKey(s.lyrics) : 'C');
                                        songs.push({
                                            id: songId,
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
                            }
                            
                            // Crear lista
                            const existingList = lists.find(l => l.name === listName);
                            if (existingList) {
                                const newIds = d.list.songIds ? d.list.songIds.filter(id => !existingList.songIds.includes(id)) : [];
                                existingList.songIds = [...existingList.songIds, ...newIds];
                                existingList.updatedAt = Date.now();
                                showNotification('📋 Lista "' + listName + '" actualizada (+' + newIds.length + ' canciones)', 'success');
                            } else {
                                lists.push({
                                    id: genId(),
                                    name: listName,
                                    description: d.list.description || '',
                                    songIds: d.list.songIds || [],
                                    createdAt: Date.now(),
                                    updatedAt: Date.now()
                                });
                                showNotification('📋 Lista "' + listName + '" creada (' + (d.list.songIds ? d.list.songIds.length : 0) + ' canciones)', 'success');
                            }
                            save('cb_lists', lists);
                            renderLists();
                        }
                    } catch(e) { console.error('Error importing list:', e); }
                };
                reader.readAsText(file);
            }
            e.target.value = '';
        });
    }
    
    // Función para parsear nombre de archivo
    window.parseSongFilename = function(name) {
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
    };
    
    // Renderizar inicial
    renderLibrary();
    renderLists();
    console.log('✅ App inicializada correctamente');
});

console.log('✅ app.js cargado');