// ============= ADMIN PANEL — archivo aparte, no toca app.js =============
// Reutiliza variables/funciones globales ya existentes en app.js:
// currentUser, supabaseClient, supabaseReady, songs, repertorios, isAdmin(),
// esc(), showPage(), fmtDate(), viewRepertorio().

let adminUsersCache = null;
let adminSongCountsCache = null;

// ---------- Menú principal (cards) ----------
function renderAdminPanel() {
    const c = document.getElementById('admin-content');
    if (!c) return;
    if (!isAdmin()) {
        c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-cards-grid">'
        + adminCardHtml('admin-usuarios', 'Usuarios', 'Ver registrados y su biblioteca', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')
        + adminCardHtml('admin-duplicados', 'Duplicados', 'Detectar canciones repetidas', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>')
        + adminCardHtml('admin-repertorios', 'Repertorios', 'Ver todos, activos y archivados', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>')
        + adminCardHtml('admin-mantenimiento', 'Mantenimiento', 'Datos y limpieza pendiente', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.77z"/></svg>')
        + adminCardHtml('admin-storage', 'Almacenamiento R2', 'Ver archivos y espacio usado', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>')
	+ adminCardHtml('admin-logs', 'Registro de actividades', 'Ver acciones de usuarios', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>')
        + '</div>';
}

function adminCardHtml(page, title, subtitle, icon) {
    return '<div class="admin-card" onclick="showPage(\'' + page + '\')"><div class="admin-card-icon">' + icon + '</div><div class="admin-card-title">' + title + '</div><div class="admin-card-subtitle">' + subtitle + '</div></div>';
}

function roleBadgeHtml(role) {
    const map = { admin: ['admin', 'Admin'], D_Musicos: ['dmusicos', 'D. Músicos'], D_Voces: ['dvoces', 'D. Voces'] };
    const m = map[role] || ['usuario', 'Usuario'];
    return '<span class="admin-badge-role ' + m[0] + '">' + m[1] + '</span>';
}

// ---------- Usuarios ----------
async function loadAdminUsersData(force) {
    if (adminUsersCache && !force) return adminUsersCache;
    if (!supabaseReady) return [];
    try {
        const { data: users, error } = await supabaseClient
            .from('admin_users')
            .select('id,nombre,apellido,role,created_at,last_login')
            .order('created_at', { ascending: false });
        if (error || !users) return [];
        const { data: allSongs } = await supabaseClient.from('user_songs').select('user_id');
        const counts = {};
        (allSongs || []).forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1 });
        adminSongCountsCache = counts;
        adminUsersCache = users;
        return users;
    } catch (e) { console.error('loadAdminUsersData error:', e); return [] }
}

async function renderAdminUsuarios(force) {
    const c = document.getElementById('admin-usuarios-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando...</div>';
    const users = await loadAdminUsersData(force);
    const q = (document.getElementById('admin-usuarios-search')?.value || '').toLowerCase();
    const filtered = users.filter(u => !q || (u.nombre || '').toLowerCase().includes(q) || (u.apellido || '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q));
    if (filtered.length === 0) { c.innerHTML = '<div class="admin-empty">No se encontraron usuarios.</div>'; return; }

    const roleOptions = ['usuario', 'D_Voces', 'D_Musicos', 'admin'];
    const roleLabels = { admin: 'Admin', D_Musicos: 'D. Músicos', D_Voces: 'D. Voces', usuario: 'Usuario' };

    c.innerHTML = `
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Canciones</th>
                    <th>Registrado</th>
                    <th>Último acceso</th>
                </tr></thead>
                <tbody>
                    ${filtered.map(u => {
    const isSelf = currentUser && currentUser.id === u.id;
    const lastLogin = u.last_login 
        ? new Date(u.last_login).toLocaleString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : 'Nunca';
    return `<tr class="admin-row-clickable" onclick="viewAdminUserSongs('${u.id}')">
        <td>${esc((u.nombre || '') + ' ' + (u.apellido || '')).trim()}<br><span style="color:#71717a;font-size:.68rem">@${esc(u.id)}</span></td>
        <td>${isSelf ? roleBadgeHtml(u.role) : `<select class="admin-role-select" onclick="event.stopPropagation()" onchange="updateUserRole('${u.id}',this.value)">${roleOptions.map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${roleLabels[r]}</option>`).join('')}</select>`}</td>
        <td>${adminSongCountsCache[u.id] || 0}</td>
        <td style="font-size:.7rem;color:#71717a">${u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '-'}</td>
        <td style="font-size:.7rem;color:#a1a1aa">${lastLogin}</td>
    </tr>`;
}).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function initAdminUsuariosPage() {
    document.getElementById('admin-usuarios-search').value = '';
    renderAdminUsuarios(true);
}

// ---------- Editar rol de usuario ----------
async function updateUserRole(userId, newRole) {
    if (!isAdmin() || !supabaseReady) return;
    if (!confirm('¿Cambiar el rol de este usuario a "' + newRole + '"?')) return;
    const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
    const oldRole = userRef ? userRef.role : '';
    try {
        const { error } = await supabaseClient.from('admin_users').update({ role: newRole }).eq('id', userId);
        if (error) throw error;
        if (userRef) userRef.role = newRole;
        showNotification('Rol actualizado a ' + newRole, 'success');
        renderAdminUsuarios(true);
        logActivity('user_role_changed', {
            oldRole: oldRole,
            newRole: newRole,
            targetUser: userId
        }, 'user', userId);
    } catch (e) {
        alert('Error al actualizar rol: ' + e.message);
    }
}

// ---------- Ver canciones de usuario ----------
let viewingAdminUserId = null;
async function viewAdminUserSongs(userId) {
    viewingAdminUserId = userId;
    showPage('admin-user-songs');
    const c = document.getElementById('admin-user-songs-content');
    const title = document.getElementById('admin-user-songs-title');
    const u = (adminUsersCache || []).find(x => x.id === userId);
    if (title) title.textContent = u ? ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.id : userId;
    c.innerHTML = '<div class="admin-empty">Cargando...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    try {
        const { data: rows, error } = await supabaseClient.from('user_songs').select('song_data').eq('user_id', userId);
        if (error || !rows) { c.innerHTML = '<div class="admin-empty">No se pudo cargar.</div>'; return }
        const list = rows.map(r => { try { return typeof r.song_data === 'string' ? JSON.parse(r.song_data) : r.song_data } catch (e) { return null } }).filter(Boolean);
        if (list.length === 0) { c.innerHTML = '<div class="admin-empty">Este usuario no tiene canciones guardadas.</div>'; return }
        c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Título</th><th>Artista</th><th>Tono</th><th>Creado por</th></tr></thead><tbody>'
            + list.map(s => '<tr><td>' + esc(s.title || 'Sin título') + '</td><td>' + esc(s.artist || '') + '</td><td>' + esc(s.originalKey || '') + '</td><td>' + esc(s.createdBy || '-') + '</td></tr>').join('')
            + '</tbody></table></div>';
    } catch (e) { console.error(e); c.innerHTML = '<div class="admin-empty">Error al cargar.</div>' }
}

// ---------- Duplicados ----------
async function renderAdminDuplicados() {
    const c = document.getElementById('admin-duplicados-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Buscando duplicados...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    try {
        const { data: rows, error } = await supabaseClient.from('user_songs').select('user_id,song_data');
        if (error || !rows) { c.innerHTML = '<div class="admin-empty">No se pudo cargar.</div>'; return }
        const groups = {};
        rows.forEach(r => {
            try {
                const sd = typeof r.song_data === 'string' ? JSON.parse(r.song_data) : r.song_data;
                if (!sd || !sd.title) return;
                const key = (sd.title || '').trim().toLowerCase() + '|' + (sd.artist || '').trim().toLowerCase();
                if (!groups[key]) groups[key] = [];
                groups[key].push({ userId: r.user_id, id: sd.id, createdBy: sd.createdBy });
            } catch (e) {}
        });
        const dupGroups = Object.entries(groups).filter(([k, arr]) => new Set(arr.map(x => x.id)).size > 1);
        if (dupGroups.length === 0) { c.innerHTML = '<div class="admin-empty">No se encontraron canciones duplicadas (mismo título/artista con IDs distintos).</div>'; return }
        c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Título — Artista</th><th>Copias con ID distinto</th><th>Creadores</th></tr></thead><tbody>'
            + dupGroups.map(([k, arr]) => {
                const uniqueIds = [...new Set(arr.map(x => x.id))];
                const creators = [...new Set(arr.map(x => x.createdBy).filter(Boolean))];
                const title = k.split('|')[0], artist = k.split('|')[1];
                return '<tr><td>' + esc(title) + ' — ' + esc(artist) + '</td><td>' + uniqueIds.length + '</td><td>' + esc(creators.join(', ') || '-') + '</td></tr>';
            }).join('')
            + '</tbody></table></div>';
    } catch (e) { console.error(e); c.innerHTML = '<div class="admin-empty">Error al buscar duplicados.</div>' }
}

// ---------- Repertorios ----------
function renderAdminRepertorios() {
    const c = document.getElementById('admin-repertorios-content');
    if (!c) return;
    if (!Array.isArray(repertorios) || repertorios.length === 0) { c.innerHTML = '<div class="admin-empty">No hay repertorios.</div>'; return }
    const sorted = repertorios.slice().sort((a, b) => (b.fecha_domingo || '').localeCompare(a.fecha_domingo || ''));
    c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Título</th><th>Fecha</th><th>Estado</th><th>Canciones</th></tr></thead><tbody>'
        + sorted.map(r => '<tr class="admin-row-clickable" onclick="viewRepertorio(\'' + r.id + '\')"><td>' + esc(r.titulo || '') + '</td><td>' + fmtDate(r.fecha_domingo) + '</td><td>' + (r.estado === 'activo' ? '<span class="admin-badge-role admin">Activo</span>' : '<span class="admin-badge-role usuario">Archivado</span>') + '</td><td>' + (r.canciones ? r.canciones.length : 0) + '</td></tr>').join('')
        + '</tbody></table></div>';
}

// ---------- Mantenimiento ----------
function renderAdminMantenimiento() {
    const c = document.getElementById('admin-mantenimiento-content');
    if (!c) return;
    const totalUsers = adminUsersCache ? adminUsersCache.length : '-';
    const totalReps = Array.isArray(repertorios) ? repertorios.length : '-';
    c.innerHTML = '<div class="admin-stat-row">'
        + '<div class="admin-stat-box"><div class="admin-stat-value">' + totalUsers + '</div><div class="admin-stat-label">Usuarios</div></div>'
        + '<div class="admin-stat-box"><div class="admin-stat-value">' + totalReps + '</div><div class="admin-stat-label">Repertorios</div></div>'
        + '</div>'
        + '<div class="admin-card" style="align-items:flex-start;text-align:left;cursor:default">'
        + '<div class="admin-card-title">Rellenar "creado por" faltante</div>'
        + '<div class="admin-card-subtitle" style="margin-bottom:10px">Busca canciones de repertorio con created_by/modified_by en NULL y trata de completarlos usando la biblioteca de origen (source_song_id).</div>'
        + '<button class="btn btn-amber" onclick="runAdminBackfillCreatedBy()">Ejecutar</button>'
        + '<div id="admin-backfill-result" style="margin-top:8px;font-size:.75rem;color:#a1a1aa"></div>'
        + '</div>';
}

async function runAdminBackfillCreatedBy() {
    const resultEl = document.getElementById('admin-backfill-result');
    if (!supabaseReady) { resultEl.textContent = 'Sin conexión.'; return }
    resultEl.textContent = 'Procesando...';
    try {
        const { data: repRows, error: e1 } = await supabaseClient.from('canciones_repertorio').select('id,source_song_id,created_by').is('created_by', null);
        if (e1 || !repRows || repRows.length === 0) { resultEl.textContent = 'No hay filas pendientes de rellenar.'; return }
        const { data: allSongs, error: e2 } = await supabaseClient.from('user_songs').select('song_data');
        if (e2 || !allSongs) { resultEl.textContent = 'No se pudo consultar user_songs.'; return }
        const byId = {};
        allSongs.forEach(r => {
            try {
                const sd = typeof r.song_data === 'string' ? JSON.parse(r.song_data) : r.song_data;
                if (sd && sd.id && sd.createdBy && !byId[sd.id]) byId[sd.id] = sd.createdBy;
            } catch (e) {}
        });
        let updated = 0;
        for (const row of repRows) {
            const cb = row.source_song_id ? byId[row.source_song_id] : null;
            if (cb) {
                await supabaseClient.from('canciones_repertorio').update({ created_by: cb }).eq('id', row.id);
                updated++;
            }
        }
        resultEl.textContent = 'Listo: ' + updated + ' de ' + repRows.length + ' filas actualizadas (las demás no tienen coincidencia conocida).';
    } catch (e) { console.error(e); resultEl.textContent = 'Error: ' + e.message }
}

// ---------- Almacenamiento R2 ----------
let r2Cache = null;
let r2CacheTime = 0;
let storageFilter = 'all';
let storageSearch = '';

async function loadR2StorageData(force) {
    if (r2Cache && !force && (Date.now() - r2CacheTime) < 60000) return r2Cache;
    try {
        const res = await fetch(R2_WORKER_URL + '/list');
        if (!res.ok) throw new Error('Error al listar archivos');
        const data = await res.json();
        r2Cache = data;
        r2CacheTime = Date.now();
        return data;
    } catch (e) {
        console.error('loadR2StorageData error:', e);
        return null;
    }
}

function getFriendlyAudioName(key, songData) {
    const filename = key.split('/').pop() || key;
    const isVocal = key.includes('vocal-audios');
    const isSong = key.includes('songs/');

    if (songData) {
        const title = songData.title || 'Sin título';
        const artist = songData.artist || 'Desconocido';
        if (isVocal) {
            const match = key.match(/coro(\d+)_(domingo|lunes)/i);
            if (match) {
                return '🎤 Coro ' + match[1] + ' (' + match[2] + ') de ' + title + ' - ' + artist;
            }
            return '🎤 Audio vocal de ' + title + ' - ' + artist;
        }
        if (isSong) {
            return '🎵 ' + title + ' - ' + artist;
        }
        return '📁 ' + title + ' - ' + artist;
    }

    if (isVocal) {
        const match = key.match(/coro(\d+)_(domingo|lunes)/i);
        if (match) {
            return '🎤 Coro ' + match[1] + ' (' + match[2] + ') - ID: ' + filename.replace(/\.[^/.]+$/, '');
        }
        return '🎤 Audio vocal - ' + filename;
    }
    if (isSong) {
        return '🎵 Canción - ' + filename;
    }
    return '📁 ' + filename;
}

let allSongsCache = null;
async function getAllSongsMap() {
    if (allSongsCache) return allSongsCache;
    if (!supabaseReady) return {};
    try {
        const { data: rows, error } = await supabaseClient.from('user_songs').select('song_data').limit(10000);
        if (error || !rows) return {};
        const map = {};
        rows.forEach(row => {
            try {
                const sd = typeof row.song_data === 'string' ? JSON.parse(row.song_data) : row.song_data;
                if (sd && sd.id) {
                    map[sd.id] = sd;
                    if (sd.sourceId) map[sd.sourceId] = sd;
                    if (sd.source_song_id) map[sd.source_song_id] = sd;
                }
            } catch (e) {}
        });
        allSongsCache = map;
        return map;
    } catch (e) {
        console.error('getAllSongsMap error:', e);
        return {};
    }
}

async function resolveSongDataForKey(key) {
    try {
        let songId = null;
        const isVocal = key.includes('vocal-audios');
        const isSong = key.includes('songs/');

        if (isVocal) {
            const match = key.match(/([a-z0-9]+)_coro/i);
            if (match) songId = match[1];
        } else if (isSong) {
            const filename = key.split('/').pop() || '';
            const base = filename.replace(/\.[^/.]+$/, '');
            const parts = base.split('-');
            if (parts.length >= 2) {
                songId = parts[parts.length - 1];
            } else {
                songId = base;
            }
        }

        if (!songId) return null;

        const songsMap = await getAllSongsMap();
        return songsMap[songId] || Object.values(songsMap).find(s => s.sourceId === songId || s.source_song_id === songId) || null;
    } catch (e) {
        console.error('resolveSongDataForKey error:', e);
        return null;
    }
}

async function renderAdminStorage() {
    const c = document.getElementById('admin-storage-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando datos de almacenamiento...</div>';
    
    const data = await loadR2StorageData(true);
    if (!data || !data.objects) {
        c.innerHTML = '<div class="admin-empty">No se pudieron obtener los archivos del almacenamiento.</div>';
        return;
    }
    
    const objects = data.objects || [];
    const totalBytes = data.totalBytes || 0;
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    
    const songs = objects.filter(o => o.key.startsWith('songs/'));
    const vocalAudios = objects.filter(o => o.key.startsWith('vocal-audios/'));
    const songsBytes = songs.reduce((sum, o) => sum + (o.size || 0), 0);
    const vocalBytes = vocalAudios.reduce((sum, o) => sum + (o.size || 0), 0);
    const songsMB = (songsBytes / (1024 * 1024)).toFixed(2);
    const vocalMB = (vocalBytes / (1024 * 1024)).toFixed(2);
    
    c.innerHTML = `
        <div class="admin-stat-row">
            <div class="admin-stat-box"><div class="admin-stat-value">${totalGB}</div><div class="admin-stat-label">Espacio total (GB)</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${data.count}</div><div class="admin-stat-label">Archivos totales</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${songsMB} MB</div><div class="admin-stat-label">🎵 Canciones</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${vocalMB} MB</div><div class="admin-stat-label">🎤 Audios vocales</div></div>
        </div>
        
        <div style="margin-bottom:10px">
            <input type="text" id="storage-search-input" class="admin-search-input" 
                   placeholder="Buscar por nombre, artista, ID..." 
                   oninput="storageSearch = this.value.toLowerCase(); renderAdminStorageCategory(storageFilter);">
        </div>
        
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <button class="btn ${storageFilter === 'all' ? 'btn-amber' : 'btn-zinc'}" 
                    onclick="storageFilter = 'all'; renderAdminStorageCategory('all')">📁 Todos</button>
            <button class="btn ${storageFilter === 'songs' ? 'btn-amber' : 'btn-zinc'}" 
                    onclick="storageFilter = 'songs'; renderAdminStorageCategory('songs')">🎵 Canciones</button>
            <button class="btn ${storageFilter === 'vocal' ? 'btn-amber' : 'btn-zinc'}" 
                    onclick="storageFilter = 'vocal'; renderAdminStorageCategory('vocal')">🎤 Vocales</button>
            <button class="btn btn-zinc" onclick="loadR2StorageData(true); renderAdminStorage()">🔄 Refrescar</button>
        </div>
        
        <div id="admin-storage-category" style="margin-top:8px"></div>
    `;
    
    renderAdminStorageCategory(storageFilter);
}

async function renderAdminStorageCategory(category) {
    const container = document.getElementById('admin-storage-category');
    if (!container) return;
    
    const data = await loadR2StorageData(false);
    if (!data || !data.objects) {
        container.innerHTML = '<div class="admin-empty">No hay datos.</div>';
        return;
    }
    
    let objects = data.objects || [];
    if (category === 'songs') objects = objects.filter(o => o.key.startsWith('songs/'));
    else if (category === 'vocal') objects = objects.filter(o => o.key.startsWith('vocal-audios/'));
    
    const searchTerm = storageSearch || '';
    if (searchTerm) {
        const withData = await Promise.all(objects.map(async (o) => {
            let songData = null;
            try { songData = await resolveSongDataForKey(o.key); } catch (e) {}
            return { ...o, songData };
        }));
        objects = withData.filter(o => {
            const name = getFriendlyAudioName(o.key, o.songData).toLowerCase();
            const id = (o.songData && o.songData.id) || '';
            const artist = (o.songData && o.songData.artist) || '';
            return name.includes(searchTerm) || id.includes(searchTerm) || artist.toLowerCase().includes(searchTerm);
        });
    }
    
    objects.sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0));
    
    if (objects.length === 0) {
        container.innerHTML = '<div class="admin-empty">No hay archivos en esta categoría.</div>';
        return;
    }
    
    const resolvedPromises = objects.map(async (o) => {
        let songData = null;
        try { songData = await resolveSongDataForKey(o.key); } catch (e) {}
        return { ...o, songData };
    });
    const resolvedObjects = await Promise.all(resolvedPromises);
    
    const sizeMB = (o) => (o.size / (1024 * 1024)).toFixed(2);
    const formatDate = (ts) => ts ? new Date(ts).toLocaleString('es-ES') : 'Fecha desconocida';
    
    container.innerHTML = `
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr>
                    <th>Archivo</th>
                    <th>Tamaño</th>
                    <th>Fecha de subida</th>
                </tr></thead>
                <tbody>
                    ${resolvedObjects.map(o => {
                        const songData = o.songData;
                        let displayName = getFriendlyAudioName(o.key, songData);
                        
                        let details = [];
                        if (songData) {
                            if (songData.originalKey) details.push('Tono: ' + songData.originalKey);
                            if (songData.tempo) details.push(songData.tempo + ' BPM');
                            if (songData.compas) details.push(songData.compas);
                        }
                        const detailsStr = details.length > 0 ? ' (' + details.join(' · ') + ')' : '';
                        
                        let songId = '—';
                        if (songData) {
                            songId = songData.id || '—';
                        } else {
                            const filename = o.key.split('/').pop() || '';
                            const base = filename.replace(/\.[^/.]+$/, '');
                            const parts = base.split('-');
                            if (parts.length >= 2) songId = parts[parts.length - 1];
                        }
                        
                        const isVocal = o.key.includes('vocal-audios');
                        const isSong = o.key.includes('songs/');
                        let badge = '';
                        if (isVocal) badge = '<span style="background:rgba(192,132,252,.2);color:#c084fc;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">VOCAL</span>';
                        else if (isSong) badge = '<span style="background:rgba(96,165,250,.2);color:#60a5fa;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">CANCIÓN</span>';
                        else badge = '<span style="background:rgba(161,161,170,.15);color:#a1a1aa;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">OTRO</span>';
                        
                        return `<tr>
                            <td>
                                <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                                    ${badge}
                                    <span style="font-size:.78rem;color:#e4e4e7">${displayName}${detailsStr}</span>
                                </div>
                                ${songId !== '—' ? `<div style="font-size:.6rem;color:#52525b;margin-top:2px">ID: ${songId}</div>` : ''}
                            </td>
                            <td style="font-size:.72rem;color:#a1a1aa">${sizeMB(o)} MB</td>
                            <td style="font-size:.7rem;color:#71717a">${formatDate(o.uploaded)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top:8px;font-size:.65rem;color:#71717a;text-align:right">
            ${objects.length} archivos · Total: ${(objects.reduce((s,o) => s + (o.size||0), 0) / (1024 * 1024)).toFixed(2)} MB
        </div>
    `;
}

// ---------- Enganches sin tocar app.js ----------
if (typeof showPage === 'function') {
    const _adminOriginalShowPage = showPage;
    showPage = function(name) {
        _adminOriginalShowPage(name);
        if (name === 'admin') renderAdminPanel();
        if (name === 'admin-usuarios') initAdminUsuariosPage();
        if (name === 'admin-duplicados') renderAdminDuplicados();
        if (name === 'admin-repertorios') renderAdminRepertorios();
        if (name === 'admin-mantenimiento') renderAdminMantenimiento();
        if (name === 'admin-storage') renderAdminStorage();
	if (name === 'admin-logs') renderAdminLogs();
    };
}

if (typeof updateUserUI === 'function') {
    const _adminOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _adminOriginalUpdateUserUI();
        const navAdmin = document.getElementById('nav-admin');
        if (navAdmin) navAdmin.style.display = (typeof isAdmin === 'function' && isAdmin()) ? '' : 'none';
    };
}

if (typeof isAdmin === 'function' && isAdmin()) {
    const navAdmin = document.getElementById('nav-admin');
    if (navAdmin) navAdmin.style.display = '';
}

// ---------- Activity Log ----------
async function logActivity(action, details, targetType, targetId) {
    if (!supabaseReady || !currentUser) return;
    try {
        const userName = currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id;
        await supabaseClient.from('activity_log').insert({
            user_id: currentUser.id,
            user_name: userName,
            user_role: userRole || 'usuario',
            action: action,
            details: details || {},
            target_type: targetType || null,
            target_id: targetId || null,
            created_at: Date.now()
        });
    } catch (e) {
        console.error('logActivity error:', e);
    }
}

// ---------- Logs de actividad ----------
async function renderAdminLogs() {
    const c = document.getElementById('admin-logs-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando logs...</div>';
    
    if (!supabaseReady) {
        c.innerHTML = '<div class="admin-empty">Sin conexión.</div>';
        return;
    }
    
    const actionFilter = document.getElementById('log-filter-action')?.value || '';
    const roleFilter = document.getElementById('log-filter-role')?.value || '';
    
    try {
        let query = supabaseClient.from('activity_log').select('*');
        
        if (actionFilter) query = query.eq('action', actionFilter);
        if (roleFilter) query = query.eq('user_role', roleFilter);
        
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(200);
        
        if (error) throw error;
        if (!data || data.length === 0) {
            c.innerHTML = '<div class="admin-empty">No hay actividades registradas aún.</div>';
            return;
        }
        
        const actionLabels = {
            song_created: '🎵 Creó canción',
            song_updated: '✏️ Editó canción',
            song_deleted: '🗑️ Eliminó canción',
            vocals_assigned: '🎤 Asignó vocales',
            audio_uploaded: '🔊 Subió audio',
            audio_deleted: '🔇 Eliminó audio',
            rep_created: '📁 Creó repertorio',
            rep_deleted: '🗑️ Eliminó repertorio',
            rep_song_added: '➕ Agregó a repertorio',
            rep_song_removed: '➖ Eliminó de repertorio',
            user_role_changed: '👤 Cambió rol de usuario'
        };
        
        const roleColors = {
            admin: '#f59e0b',
            D_Musicos: '#60a5fa',
            D_Voces: '#c084fc',
            usuario: '#a1a1aa'
        };
        
        c.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr>
                        <th>Fecha/Hora</th>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Acción</th>
                        <th>Detalles</th>
                    </tr></thead>
                    <tbody>
                        ${data.map(log => {
                            const date = new Date(log.created_at).toLocaleString('es-ES', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                            });
                            const actionLabel = actionLabels[log.action] || log.action;
                            const roleColor = roleColors[log.user_role] || '#a1a1aa';
                            
                            let detailsHtml = '-';
                            if (log.details) {
                                const d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                                const parts = [];
                                if (d.title) parts.push('📝 ' + d.title);
                                if (d.artist) parts.push('🎤 ' + d.artist);
                                if (d.songTitle) parts.push('📝 ' + d.songTitle);
                                if (d.day) parts.push('📅 ' + d.day);
                                if (d.main) parts.push('👤 ' + d.main);
                                if (d.coro) parts.push('🎤 Coro ' + d.coro);
                                if (d.dia) parts.push('📅 ' + d.dia);
                                if (d.newRole) parts.push('➡️ ' + d.newRole);
                                if (d.targetUser) parts.push('👤 @' + d.targetUser);
                                if (d.repertorio) parts.push('📁 ' + d.repertorio);
                                if (d.type === 'vocal') parts.push('🎤 Vocal');
                                if (d.type === 'song') parts.push('🎵 Canción');
                                if (d.fileSize) parts.push('📦 ' + (d.fileSize / 1024 / 1024).toFixed(2) + ' MB');
                                if (d.mode === 'add') parts.push('➕ Nueva');
                                if (d.mode === 'edit') parts.push('✏️ Edición');
                                detailsHtml = parts.join(' · ') || '-';
                            }
                            
                            return `<tr>
                                <td style="font-size:.7rem;color:#71717a;white-space:nowrap">${date}</td>
                                <td style="font-size:.78rem;color:#e4e4e7">${esc(log.user_name || log.user_id)}</td>
                                <td><span style="color:${roleColor};font-size:.7rem;font-weight:600">${log.user_role}</span></td>
                                <td style="font-size:.78rem;color:#fbbf24">${actionLabel}</td>
                                <td style="font-size:.7rem;color:#a1a1aa">${detailsHtml}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:8px;font-size:.65rem;color:#71717a;text-align:right">
                Mostrando los últimos ${data.length} registros
            </div>
        `;
    } catch (e) {
        console.error('renderAdminLogs error:', e);
        c.innerHTML = '<div class="admin-empty">Error al cargar logs: ' + e.message + '</div>';
    }
}