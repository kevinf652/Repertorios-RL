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
    if (!isAdmin() && !isSubAdmin()) {
        c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-cards-grid">'
        + '<div class="admin-summary-panel" id="admin-summary-panel"><div class="admin-summary-title">Vistazo rápido</div><div class="admin-empty" style="padding:10px 0">Cargando...</div></div>'
        + adminCardHtml('admin-usuarios', 'Usuarios', 'Ver registrados y su biblioteca', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')
        + (isAdmin() ? adminCardHtml('admin-duplicados', 'Duplicados', 'Detectar canciones repetidas', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>') : '')
        + adminCardHtml('admin-repertorios', 'Repertorios', 'Ver todos, activos y archivados', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>')
        + adminCardHtml('admin-mantenimiento', 'Mantenimiento', 'Datos y limpieza pendiente', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.77z"/></svg>')
        + (isAdmin() ? adminCardHtml('admin-storage', 'Almacenamiento R2', 'Ver archivos y espacio usado', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>') : '')
        + (isAdmin() ? adminCardHtml('admin-notificaciones', 'Notificaciones', 'Ver, editar y eliminar activas', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>') : '')
	+ adminCardHtml('admin-logs', 'Registro de actividades', 'Ver acciones de usuarios', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>')
        + '</div>';
    renderAdminSummary();
}

// ---------- Panel resumen (vistazo rápido) ----------
async function renderAdminSummary() {
    const el = document.getElementById('admin-summary-panel');
    if (!el) return;
    if (!supabaseReady) {
        el.innerHTML = '<div class="admin-summary-title">Vistazo rápido</div><div class="admin-empty" style="padding:6px 0">Sin conexión.</div>';
        return;
    }
    try {
        const users = await loadAdminUsersData(false);
        const totalUsers = users.length;
        const totalSongs = Object.values(adminSongCountsCache || {}).reduce((a, b) => a + b, 0);
        const totalReps = Array.isArray(repertorios) ? repertorios.length : 0;
        const activeReps = Array.isArray(repertorios) ? repertorios.filter(r => r.estado === 'activo').length : 0;

        const since24h = Date.now() - 24 * 60 * 60 * 1000;
        let actions24h = '-';
        try {
            const { count } = await supabaseClient.from('activity_log').select('id', { count: 'exact', head: true }).gte('created_at', since24h);
            actions24h = (count === null || count === undefined) ? '-' : count;
        } catch (e) {}

        let recentHtml = '';
        try {
            const { data: recent } = await supabaseClient.from('activity_log').select('user_name,action,created_at').order('created_at', { ascending: false }).limit(1);
            if (recent && recent[0]) {
                const labels = {
                    song_created: 'creó una canción', song_updated: 'editó una canción', song_deleted: 'eliminó una canción',
                    vocals_assigned: 'asignó vocales', audio_uploaded: 'subió un audio', audio_deleted: 'eliminó un audio',
                    rep_created: 'creó un repertorio', rep_deleted: 'eliminó un repertorio', rep_song_added: 'agregó una canción a un repertorio',
                    rep_song_removed: 'quitó una canción de un repertorio', user_role_changed: 'cambió el rol de un usuario',
                    password_reset: 'restableció una contraseña', backfill_created_by: 'ejecutó mantenimiento',
                    activity_created: 'propuso una actividad', activity_deleted: 'eliminó una actividad', social_profile_updated: 'actualizó sus datos',
                    help_video_added: 'agregó un video de ayuda', help_video_deleted: 'eliminó un video de ayuda', help_video_updated: 'editó un video de ayuda',
                    r2_file_deleted: 'limpió un duplicado de Storage'
                };
                const when = new Date(recent[0].created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                recentHtml = '<div class="admin-summary-recent">🕒 Última actividad: <b style="color:#e4e4e7">' + esc(recent[0].user_name || '') + '</b> ' + (labels[recent[0].action] || recent[0].action) + ' · ' + when + '</div>';
            }
        } catch (e) {}

        el.innerHTML = '<div class="admin-summary-title">Vistazo rápido</div>'
            + '<div class="admin-summary-grid">'
            + '<div class="admin-summary-item"><div class="admin-summary-value">' + totalUsers + '</div><div class="admin-summary-label">Usuarios</div></div>'
            + '<div class="admin-summary-item"><div class="admin-summary-value">' + totalSongs + '</div><div class="admin-summary-label">Canciones</div></div>'
            + '<div class="admin-summary-item"><div class="admin-summary-value">' + activeReps + '/' + totalReps + '</div><div class="admin-summary-label">Rep. activos</div></div>'
            + '<div class="admin-summary-item"><div class="admin-summary-value">' + actions24h + '</div><div class="admin-summary-label">Acciones 24h</div></div>'
            + '</div>'
            + recentHtml;
    } catch (e) {
        console.error('renderAdminSummary error:', e);
        el.innerHTML = '<div class="admin-summary-title">Vistazo rápido</div><div class="admin-empty" style="padding:6px 0">No se pudo cargar.</div>';
    }
}

function adminCardHtml(page, title, subtitle, icon) {
    return '<div class="admin-card" onclick="showPage(\'' + page + '\')"><div class="admin-card-icon">' + icon + '</div><div class="admin-card-title">' + title + '</div><div class="admin-card-subtitle">' + subtitle + '</div></div>';
}

function roleBadgeHtml(role) {
    const map = { admin: ['admin', 'Admin'], D_Musicos: ['dmusicos', 'D. Músicos'], D_Voces: ['dvoces', 'D. Voces'], Social: ['social', 'Social'], SubAdmin: ['subadmin', 'Subadmin'] };
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
            .select('id,nombre,apellido,role,created_at,last_login,puede_notificar')
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

    const roleOptions = ['usuario', 'D_Voces', 'D_Musicos', 'Social', 'SubAdmin', 'admin'];
    const roleLabels = { admin: 'Admin', D_Musicos: 'D. Músicos', D_Voces: 'D. Voces', Social: 'Social', SubAdmin: 'Subadmin', usuario: 'Usuario' };
    // Un Subadmin no puede tocar el rol de un Admin, ni asignarle el rol Admin a nadie
    const viewerIsSubAdmin = !isAdmin() && isSubAdmin();
    const assignableOptions = viewerIsSubAdmin ? roleOptions.filter(r => r !== 'admin') : roleOptions;

    c.innerHTML = `
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead><tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Canciones</th>
                    <th>Registrado</th>
                    <th>Último acceso</th>
                    <th>Notificar</th>
                    <th>Acciones</th>
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
        <td>${(isSelf || (viewerIsSubAdmin && u.role === 'admin')) ? roleBadgeHtml(u.role) : `<select class="admin-role-select" onclick="event.stopPropagation()" onchange="updateUserRole('${u.id}',this.value)">${assignableOptions.map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${roleLabels[r]}</option>`).join('')}</select>`}</td>
        <td>${adminSongCountsCache[u.id] || 0}</td>
        <td style="font-size:.7rem;color:#71717a">${u.created_at ? new Date(u.created_at).toLocaleDateString('es-ES') : '-'}</td>
        <td style="font-size:.7rem;color:#a1a1aa">${lastLogin}</td>
        <td onclick="event.stopPropagation()">${(u.role === 'admin' || u.role === 'SubAdmin') ? '<span style="font-size:.65rem;color:#71717a">Siempre</span>' : `<input type="checkbox" ${u.puede_notificar ? 'checked' : ''} onchange="toggleUserCanNotify('${u.id}', this.checked)" style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer">`}</td>
        <td>${(isSelf || (viewerIsSubAdmin && u.role === 'admin')) ? '' : `<button class="btn-outline-sm" onclick="event.stopPropagation(); resetUserPassword('${u.id}')">🔑 Restablecer</button>`}</td>
    </tr>`;
}).join('')}
                </tbody>
            </table>
        </div>
    `;
    // Sección de usuarios eliminados movida a Mantenimiento
}

function initAdminUsuariosPage() {
    document.getElementById('admin-usuarios-search').value = '';
    renderAdminUsuarios(true);
}

// ---------- Usuarios inactivos (solo Admin) + eliminar cuenta ----------
let inactiveUsersFilter = 'all';

async function renderAdminInactiveUsersSection() {
    const c = document.getElementById('admin-delete-users-content');
    if (!c) return;
    if (!isAdmin()) { c.innerHTML = ''; return }

    const users = adminUsersCache || [];
    const now = Date.now();
    const thresholds = { never: null, '30': 30, '60': 60, '90': 90, '180': 180 };

    const filtered = users.filter(u => {
        if (inactiveUsersFilter === 'all') return true;
        if (inactiveUsersFilter === 'never') return !u.last_login;
        if (!u.last_login) return true; // nunca ha entrado también cuenta como "más de X días"
        const days = thresholds[inactiveUsersFilter];
        const lastLoginMs = new Date(u.last_login).getTime();
        return (now - lastLoginMs) / (1000 * 60 * 60 * 24) >= days;
    });

    c.innerHTML = `
        <div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(63,63,70,.4)">
            <div class="admin-section-title" style="margin-bottom:2px">🧹 Mantenimiento de usuarios</div>
            <div class="admin-section-subtitle">Solo tú puedes ver esto y eliminar cuentas — acción irreversible</div>
            <select id="inactive-users-filter" class="admin-search-input" onchange="inactiveUsersFilter = this.value; renderAdminInactiveUsersSection()">
                <option value="all" ${inactiveUsersFilter === 'all' ? 'selected' : ''}>Todos los usuarios</option>
                <option value="never" ${inactiveUsersFilter === 'never' ? 'selected' : ''}>Nunca han entrado</option>
                <option value="30" ${inactiveUsersFilter === '30' ? 'selected' : ''}>Sin actividad hace +30 días</option>
                <option value="60" ${inactiveUsersFilter === '60' ? 'selected' : ''}>Sin actividad hace +60 días</option>
                <option value="90" ${inactiveUsersFilter === '90' ? 'selected' : ''}>Sin actividad hace +90 días</option>
                <option value="180" ${inactiveUsersFilter === '180' ? 'selected' : ''}>Sin actividad hace +6 meses</option>
            </select>
            <div id="inactive-users-list"></div>
        </div>
    `;

    const list = document.getElementById('inactive-users-list');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="admin-empty">Nadie coincide con este filtro.</div>';
        return;
    }
    list.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Canciones</th><th>Último acceso</th><th>Acción</th></tr></thead><tbody>'
        + filtered.map(u => {
            const isSelf = currentUser && currentUser.id === u.id;
            const fullName = ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.id;
            const lastLogin = u.last_login ? new Date(u.last_login).toLocaleDateString('es-ES') : 'Nunca';
            return '<tr>'
                + '<td style="font-size:.78rem">' + esc(fullName) + '<br><span style="color:#71717a;font-size:.65rem">@' + esc(u.id) + '</span></td>'
                + '<td>' + roleBadgeHtml(u.role) + '</td>'
                + '<td style="font-size:.72rem">' + (adminSongCountsCache[u.id] || 0) + '</td>'
                + '<td style="font-size:.72rem;color:#a1a1aa">' + lastLogin + '</td>'
                + '<td>' + (isSelf || u.role === 'admin' ? '<span style="font-size:.65rem;color:#71717a">—</span>' : '<button class="btn-danger-sm" onclick="deleteAdminUser(\'' + u.id + '\')">🗑️ Eliminar</button>') + '</td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

async function deleteAdminUser(userId) {
    if (!isAdmin() || !supabaseReady) return;
    const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
    if (!userRef) return;
    if (userRef.role === 'admin') { alert('No se puede eliminar a otro Admin desde aquí.'); return }
    if (currentUser && currentUser.id === userId) { alert('No puedes eliminar tu propia cuenta.'); return }
    if (!confirm('¿ELIMINAR PERMANENTEMENTE la cuenta de "' + userId + '"? Se borra su biblioteca y su perfil. Esta acción no se puede deshacer.')) return;
    if (!confirm('Confírmalo una vez más: no hay forma de recuperar esto después. ¿Continuar?')) return;
    try {
        await supabaseClient.from('user_songs').delete().eq('user_id', userId);
        await supabaseClient.from('social_profiles').delete().eq('user_id', userId);
        await supabaseClient.from('admin_users').delete().eq('id', userId);
        showNotification('Usuario eliminado', 'success');
        logActivity('user_deleted', { targetUser: userId }, 'user', userId);
        adminUsersCache = null;
        renderAdminUsuarios(true);
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

// ---------- Editar rol de usuario ----------
async function updateUserRole(userId, newRole) {
    if ((!isAdmin() && !isSubAdmin()) || !supabaseReady) return;
    const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
    if (!isAdmin() && isSubAdmin()) {
        if (newRole === 'admin') { alert('Un Subadmin no puede asignar el rol Admin.'); return }
        if (userRef && userRef.role === 'admin') { alert('Un Subadmin no puede cambiar el rol de un Admin.'); return }
    }
    if (!confirm('¿Cambiar el rol de este usuario a "' + newRole + '"?')) return;
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

// ---------- Restablecer contraseña de usuario ----------
async function resetUserPassword(userId) {
    if ((!isAdmin() && !isSubAdmin()) || !supabaseReady) return;
    if (!isAdmin() && isSubAdmin()) {
        const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
        if (userRef && userRef.role === 'admin') { alert('Un Subadmin no puede restablecer la contraseña de un Admin.'); return }
    }
    if (!confirm('¿Restablecer la contraseña de "' + userId + '" a "1234"? La persona podrá entrar con esa clave y luego cambiarla.')) return;
    try {
        const { error } = await supabaseClient.from('admin_users').update({ password_hash: '1234' }).eq('id', userId);
        if (error) throw error;
        showNotification('Contraseña restablecida a 1234', 'success');
        logActivity('password_reset', {
            targetUser: userId
        }, 'user', userId);
    } catch (e) {
        alert('Error al restablecer contraseña: ' + e.message);
    }
}

async function toggleUserCanNotify(userId, checked) {
    if ((!isAdmin() && !isSubAdmin()) || !supabaseReady) return;
    if (!isAdmin() && isSubAdmin()) {
        const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
        if (userRef && userRef.role === 'admin') { alert('Un Subadmin no puede cambiar esto para un Admin.'); renderAdminUsuarios(true); return }
    }
    try {
        const { error } = await supabaseClient.from('admin_users').update({ puede_notificar: checked }).eq('id', userId);
        if (error) throw error;
        const userRef = adminUsersCache ? adminUsersCache.find(u => u.id === userId) : null;
        if (userRef) userRef.puede_notificar = checked;
        showNotification(checked ? 'Ahora puede enviar notificaciones' : 'Ya no puede enviar notificaciones', 'success');
        logActivity('user_role_changed', {
            targetUser: userId,
            note: checked ? 'autorizado para notificar' : 'notificar revocado'
        }, 'user', userId);
    } catch (e) {
        alert('Error: ' + e.message);
        renderAdminUsuarios(true);
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
    if (!isAdmin()) { c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>'; return }
    c.innerHTML = '<div class="admin-empty">Buscando duplicados...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    try {
        const { data: rows, error } = await supabaseClient.from('user_songs').select('id,user_id,song_data');
        if (error || !rows) { c.innerHTML = '<div class="admin-empty">No se pudo cargar.</div>'; return }
        const groups = {};
        rows.forEach(r => {
            try {
                const sd = typeof r.song_data === 'string' ? JSON.parse(r.song_data) : r.song_data;
                if (!sd || !sd.title) return;
                const key = (sd.title || '').trim().toLowerCase() + '|' + (sd.artist || '').trim().toLowerCase();
                if (!groups[key]) groups[key] = [];
                groups[key].push({ rowId: r.id, userId: r.user_id, id: sd.id, createdBy: sd.createdBy, title: sd.title, artist: sd.artist });
            } catch (e) {}
        });
        const dupGroups = Object.entries(groups).filter(([k, arr]) => new Set(arr.map(x => x.id)).size > 1);
        if (dupGroups.length === 0) { c.innerHTML = '<div class="admin-empty">No se encontraron canciones duplicadas (mismo título/artista con IDs distintos).</div>'; return }
        c.innerHTML = dupGroups.map(([k, arr]) => {
            const title = k.split('|')[0], artist = k.split('|')[1];
            return '<div style="margin-bottom:14px">'
                + '<div style="font-size:.82rem;font-weight:600;color:#e4e4e7;margin-bottom:6px">' + esc(title) + ' — ' + esc(artist) + ' <span style="color:#71717a;font-weight:400;font-size:.7rem">(' + arr.length + ' copias)</span></div>'
                + '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Usuario</th><th>Creado por</th><th>ID canción</th><th></th></tr></thead><tbody>'
                + arr.map(x => '<tr><td style="font-size:.75rem">@' + esc(x.userId) + '</td><td style="font-size:.72rem;color:#a1a1aa">' + esc(x.createdBy || '-') + '</td><td style="font-size:.65rem;color:#52525b">' + esc(x.id || '-') + '</td><td><button class="btn-danger-sm" onclick="adminDeleteDuplicateCopy(\'' + x.rowId + '\',\'' + esc(x.userId) + '\',\'' + esc(title).replace(/'/g, "\\'") + '\')">🗑️ Borrar</button></td></tr>').join('')
                + '</tbody></table></div>'
                + '</div>';
        }).join('');
    } catch (e) { console.error(e); c.innerHTML = '<div class="admin-empty">Error al buscar duplicados.</div>' }
}

async function adminDeleteDuplicateCopy(rowId, userId, title) {
    if (!isAdmin() || !supabaseReady) return;
    if (!confirm('¿Eliminar esta copia de "' + title + '" de la biblioteca de @' + userId + '? Esta acción no se puede deshacer.')) return;
    try {
        const { error } = await supabaseClient.from('user_songs').delete().eq('id', rowId);
        if (error) throw error;
        showNotification('Copia eliminada', 'success');
        logActivity('song_deleted', {
            title: title,
            targetUser: userId
        }, 'song', null);
        renderAdminDuplicados();
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

// ---------- Duplicados en Almacenamiento R2 (solo storage, no toca tablas) ----------

// Helper: Normalizar key de R2 quitando el timestamp del nombre de archivo
// Ej: "vocal-audios/1787610144649-msvv4vx9bre1d0n1b_coro3_lunes.mp3" → "msvv4vx9bre1d0n1b_coro3_lunes.mp3"
function normalizeVocalKey(key) {
    if (!key) return '';
    const parts = key.split('/');
    const filename = parts[parts.length - 1] || '';
    // Quitar timestamp tipo "1787610144649-" del inicio del nombre
    const normalized = filename.replace(/^\d{13}-/, '');
    // Reconstruir con la carpeta
    parts[parts.length - 1] = normalized;
    return parts.join('/');
}

function extractDuplicateGroupKey(key) {
    const isVocal = key.includes('vocal-audios');
    const isSong = key.includes('songs/');
    if (isVocal) {
        const idMatch = key.match(/([a-z0-9]+)_coro/i);
        const coroMatch = key.match(/coro(\d+)(?:_([ab]))?_(domingo|lunes)/i);
        if (idMatch && coroMatch) {
            const part = coroMatch[2] || 'a';
            return 'vocal|' + idMatch[1] + '|' + coroMatch[1] + '|' + part + '|' + coroMatch[3];
        }
        return null;
    }
    if (isSong) {
        const filename = key.split('/').pop() || '';
        const base = filename.replace(/\.[^/.]+$/, '');
        const parts = base.split('-');
        const songId = parts.length >= 2 ? parts[parts.length - 1] : base;
        return 'song|' + songId;
    }
    return null;
}

async function renderAdminR2Duplicates(force) {
    const c = document.getElementById('admin-r2-duplicates-content');
    if (!c) return;
    if (!isAdmin()) { c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>'; return }
    c.innerHTML = '<div class="admin-empty">Buscando duplicados en Storage...</div>';
    try {
        const data = await loadR2StorageData(force);
        if (!data || !data.objects) { c.innerHTML = '<div class="admin-empty">No se pudo cargar Storage.</div>'; return }

        const groups = {};
        data.objects.forEach(o => {
            const gKey = extractDuplicateGroupKey(o.key);
            if (!gKey) return;
            if (!groups[gKey]) groups[gKey] = [];
            groups[gKey].push(o);
        });
        const dupGroups = Object.entries(groups).filter(([k, arr]) => arr.length > 1);

        if (dupGroups.length === 0) {
            c.innerHTML = '<div class="admin-empty">No se encontraron archivos duplicados en Storage 🎉</div>';
            return;
        }

        const parts = [];
        for (const [gKey, objs] of dupGroups) {
            const isVocal = gKey.startsWith('vocal|');
            const songData = await resolveSongDataForKey(objs[0].key);
            const title = songData ? (songData.title + (songData.artist ? ' - ' + songData.artist : '')) : 'Audio sin identificar';

            // Detectar cuál archivo está realmente enlazado usando audio_url de la DB
            let linkedKey = null;
            try {
                if (isVocal) {
                    const [, sourceSongId, coroNum, part, dia] = gKey.split('|');
                    const { data: rows } = await supabaseClient.from('vocal_audios').select('audio_url,audio_path').eq('source_song_id', sourceSongId).eq('coro_number', parseInt(coroNum, 10)).eq('dia', dia).eq('part', part || 'a');
                    if (rows && rows[0]) {
                        // Usar audio_url como fuente de truth (tiene el timestamp completo del worker)
                        linkedKey = extractR2Key(rows[0].audio_url);
                        if (!linkedKey && rows[0].audio_path) linkedKey = rows[0].audio_path;
                        console.log('🔗 Linked key for', gKey, '→', linkedKey, '(from audio_url:', rows[0].audio_url, ')');
                    }
                } else {
                    const songId = gKey.split('|')[1];
                    const { data: rows } = await supabaseClient.from('canciones_repertorio').select('audio_url').eq('source_song_id', songId).limit(1);
                    if (rows && rows[0]) linkedKey = extractR2Key(rows[0].audio_url);
                }
            } catch (e) { console.warn('Error detecting linked key:', e); }

            const rowsHtml = objs.map(o => {
                // Comparar con igualdad EXACTA: no usar normalización porque
                // ambos duplicados tienen la misma base y los dos matchearían.
                const isLinked = linkedKey && o.key === linkedKey;
                const sizeMBVal = ((o.size || 0) / (1024 * 1024)).toFixed(2);
                const dateStr = o.uploaded ? new Date(o.uploaded).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                const keyEsc = o.key.replace(/'/g, "\\'");
                return '<tr>'
                    + '<td style="font-size:.68rem;color:#a1a1aa;word-break:break-all">' + esc(o.key) + '</td>'
                    + '<td style="font-size:.72rem">' + sizeMBVal + ' MB</td>'
                    + '<td style="font-size:.68rem;color:#71717a">' + dateStr + '</td>'
                    + '<td>' + (isLinked
                        ? '<span style="background:rgba(52,211,153,.15);color:#34d399;font-size:.65rem;padding:3px 8px;border-radius:6px;font-weight:600">✅ En uso</span>'
                        : '<button class="btn-danger-sm" onclick="adminDeleteR2OnlyFile(\'' + keyEsc + '\')">🗑️ Borrar solo de Storage</button>')
                    + '</td>'
                    + '</tr>';
            }).join('');

            parts.push('<div style="margin-bottom:14px">'
                + '<div style="font-size:.82rem;font-weight:600;color:#e4e4e7;margin-bottom:6px">' + esc(title) + ' <span style="color:#71717a;font-weight:400;font-size:.7rem">(' + objs.length + ' copias en Storage)</span></div>'
                + '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Archivo</th><th>Tamaño</th><th>Subido</th><th>Acción</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
                + '</div>');
        }
        c.innerHTML = parts.join('');
    } catch (e) {
        console.error('renderAdminR2Duplicates error:', e);
        c.innerHTML = '<div class="admin-empty">Error al buscar duplicados en Storage.</div>';
    }
}

async function adminDeleteR2OnlyFile(key) {
    if (!isAdmin()) return;
    if (!confirm('¿Eliminar este archivo SOLO de Almacenamiento (R2)?\n\nNo se tocará ninguna canción, repertorio ni tabla de la base de datos — es solo limpieza del archivo sobrante. Esta acción no se puede deshacer.')) return;
    try {
        const deleteUrl = getR2DeleteUrl(key);
        console.log('🗑️ [Duplicados] Deleting:', key, '→ URL:', deleteUrl);
        const response = await r2Fetch(deleteUrl, { method: 'DELETE' });
        console.log('🗑️ [Duplicados] Response:', response.status, response.ok);
        if (!response.ok) {
            const errText = await response.text();
            console.warn('⚠️ Delete failed:', response.status, errText);
        }
        showNotification('Archivo eliminado de Storage', 'success');
        logActivity('r2_file_deleted', { key: key }, 'storage', null);
        r2Cache = null;
        renderAdminR2Duplicates(true);
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

// ---------- Repertorios ----------
function renderAdminRepertorios() {
    const c = document.getElementById('admin-repertorios-content');
    if (!c) return;
    if (!Array.isArray(repertorios) || repertorios.length === 0) { c.innerHTML = '<div class="admin-empty">No hay repertorios.</div>'; return }
    const sorted = repertorios.slice().sort((a, b) => (b.fecha_domingo || '').localeCompare(a.fecha_domingo || ''));
    c.innerHTML = sorted.map(r => {
        const sc = r.canciones ? r.canciones.length : 0;
        const estadoBadge = r.estado === 'activo'
            ? '<span class="admin-badge-role admin">Activo</span>'
            : '<span class="admin-badge-role usuario">Archivado</span>';
        const ambos = (r.canciones || []).filter(s => s.dia === 'ambos');
        const dom = (r.canciones || []).filter(s => s.dia === 'domingo');
        const lun = (r.canciones || []).filter(s => s.dia === 'lunes');
        function songListHtml(songs, label) {
            if (songs.length === 0) return '';
            return '<div style="margin-top:6px">'
                + '<div style="font-size:.65rem;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + label + '</div>'
                + songs.map(s => '<div style="font-size:.72rem;color:#d4d4d8;padding:2px 0;border-bottom:1px solid rgba(63,63,70,.3)">' + esc(s.titulo || 'Sin título') + ' <span style="color:#71717a">—</span> ' + esc(s.artista || '') + '</div>').join('')
                + '</div>';
        }
        const songLists = songListHtml(ambos, 'Ambos días') + songListHtml(dom, 'Domingo') + songListHtml(lun, 'Lunes');
        return '<div style="background:rgba(39,39,42,.6);border:1px solid rgba(63,63,70,.4);border-radius:10px;padding:12px;margin-bottom:10px">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;cursor:pointer" onclick="viewRepertorio(\'' + r.id + '\')">'
            + '<div style="flex:1;min-width:0"><div style="font-weight:600;color:#fff;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.titulo || '') + '</div>'
            + '<div style="font-size:.72rem;color:#a1a1aa">' + fmtDate(r.fecha_domingo) + '</div></div>'
            + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' + estadoBadge
            + '<span style="font-size:.75rem;color:#a1a1aa">' + sc + ' canc.</span>'
            + '<button class="btn-icon" onclick="event.stopPropagation();showDuplicateRepertorioModal(\'' + r.id + '\')" title="Duplicar repertorio" style="color:#60a5fa"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'
            + '</div></div>'
            + (sc > 0 ? songLists : '<div style="font-size:.7rem;color:#52525b;font-style:italic;margin-top:6px">Sin canciones</div>')
            + '</div>';
    }).join('');
}

// ---------- Mantenimiento ----------
function renderAdminMantenimiento() {
    const c = document.getElementById('admin-mantenimiento-content');
    if (!c) return;
    const totalUsers = adminUsersCache ? adminUsersCache.length : '-';
    const totalReps = Array.isArray(repertorios) ? repertorios.length : '-';
    c.innerHTML = '<div class="admin-stat-row">'
        + (isAdmin() ? '<div class="admin-stat-box" onclick="showPage(\'admin-delete-users\')" style="cursor:pointer"><div class="admin-stat-value">' + totalUsers + '</div><div class="admin-stat-label">Usuarios 🗑️</div></div>' : '<div class="admin-stat-box"><div class="admin-stat-value">' + totalUsers + '</div><div class="admin-stat-label">Usuarios</div></div>')
        + '<div class="admin-stat-box"><div class="admin-stat-value">' + totalReps + '</div><div class="admin-stat-label">Repertorios</div></div>'
        + '</div>'
        + '<div class="admin-card" style="align-items:flex-start;text-align:left;cursor:default">'
        + '<div class="admin-card-title">Rellenar "creado por" faltante</div>'
        + '<div class="admin-card-subtitle" style="margin-bottom:10px">Busca canciones de repertorio con created_by/modified_by en NULL y trata de completarlos usando la biblioteca de origen (source_song_id).</div>'
        + '<button class="btn btn-amber" onclick="runAdminBackfillCreatedBy()">Ejecutar</button>'
        + '<div id="admin-backfill-result" style="margin-top:8px;font-size:.75rem;color:#a1a1aa"></div>'
        + '</div>'
        // === Sección: Audios huérfanos ===
        + '<div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(63,63,70,.4)">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
        + '<div>'
        + '<div class="admin-section-title" style="margin-bottom:2px">🧹 Audios huérfanos</div>'
        + '<div class="admin-section-subtitle">Archivos en R2 que ya no enlaza ninguna canción, coro o repertorio</div>'
        + '</div>'
        + '<button class="btn btn-zinc" onclick="renderAdminOrphanedAudios(true)">🔄 Buscar</button>'
        + '</div>'
        + '<div id="admin-mantenimiento-orphaned-audios"></div>'
        + '</div>';
    renderAdminOrphanedAudios(false);
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
        logActivity('backfill_created_by', {
            updated: updated,
            total: repRows.length
        }, 'system', null);
    } catch (e) { console.error(e); resultEl.textContent = 'Error: ' + e.message }
}

// ---------- Almacenamiento R2 ----------
let r2Cache = null;
let r2CacheTime = 0;
let storageFilter = 'all';
let storageSearch = '';
let storageFormatFilter = 'all';
let audioFormatCache = {};

// Lee los primeros bytes reales del archivo para saber su formato de verdad
// (la extensión del nombre no siempre es confiable — ver historial de este proyecto)
async function detectAudioFormat(key) {
    if (audioFormatCache[key]) return audioFormatCache[key];
    // 1. Intentar detectar por magic bytes (Range request)
    try {
        const url = R2_WORKER_URL + '/file/' + encodeURIComponent(key);
        const res = await fetch(url, { headers: { 'Range': 'bytes=0-15' } });
        if (res.ok || res.status === 206) {
            const buf = await res.arrayBuffer();
            const b = new Uint8Array(buf);
            let format = null;
            if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
                format = 'AAC/MP4'; // 'ftyp' en el byte 4
            } else if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
                format = 'MP3'; // ID3 tag
            } else if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) {
                format = 'MP3'; // sync frame MPEG sin ID3
            } else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
                format = 'WAV';
            } else if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
                format = 'OGG';
            }
            if (format) {
                audioFormatCache[key] = format;
                return format;
            }
        }
    } catch (e) {
        // Range request falló, continuar con fallback
    }
    // 2. Fallback: detectar por extensión del archivo
    const ext = (key.split('.').pop() || '').toLowerCase();
    const extMap = {
        'mp3': 'MP3', 'mp2': 'MP3', 'mp1': 'MP3',
        'm4a': 'AAC/MP4', 'aac': 'AAC/MP4', 'mp4': 'AAC/MP4', 'm4b': 'AAC/MP4', 'm4p': 'AAC/MP4',
        'ogg': 'OGG', 'oga': 'OGG', 'opus': 'OGG',
        'wav': 'WAV', 'wave': 'WAV', 'wv': 'WAV',
        'flac': 'FLAC', 'webm': 'WebM'
    };
    const format = extMap[ext] || 'Desconocido';
    audioFormatCache[key] = format;
    return format;
}

async function detectAllVisibleFormats() {
    const data = await loadR2StorageData(false);
    const objects = (data && data.objects) || [];
    await Promise.all(objects.map(o => detectAudioFormat(o.key)));
    renderAdminStorageCategory(storageFilter);
}

// ---------- Audios huérfanos (sin ninguna referencia en la base de datos) ----------
async function renderAdminOrphanedAudios(force) {
    const c = document.getElementById('admin-mantenimiento-orphaned-audios');
    if (!c) return;
    if (!isAdmin()) { c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>'; return }
    c.innerHTML = '<div class="admin-empty">Buscando huérfanos...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }

    try {
        const data = await loadR2StorageData(force);
        const objects = (data && data.objects) || [];

        // IDs de canción que existen en la base de datos (con o sin audio_url)
        // Un archivo R2 NO es huérfano si la canción existe en cualquier tabla
        const referencedSongIds = new Set();

        // 1. Canciones del usuario local (array global songs)
        if (typeof songs !== 'undefined' && Array.isArray(songs)) {
            songs.forEach(s => {
                if (s.id) referencedSongIds.add(s.id);
                if (s.sourceId) referencedSongIds.add(s.sourceId);
            });
        }

        // 2. Tabla canciones_repertorio
        try {
            const { data: repRows } = await supabaseClient.from('canciones_repertorio').select('source_song_id');
            (repRows || []).forEach(r => { if (r.source_song_id) referencedSongIds.add(r.source_song_id) });
        } catch (e) {}
        // 3. Tabla user_songs (song_data JSON)
        try {
            const { data: userSongsRows } = await supabaseClient.from('user_songs').select('song_data');
            (userSongsRows || []).forEach(r => {
                try {
                    const sd = typeof r.song_data === 'string' ? JSON.parse(r.song_data) : r.song_data;
                    if (sd) {
                        if (sd.id) referencedSongIds.add(sd.id);
                        if (sd.sourceId) referencedSongIds.add(sd.sourceId);
                    }
                } catch (e) {}
            });
        } catch (e) {}

        console.log('[OrphanDetector] referencedSongIds:', Array.from(referencedSongIds));

        // Combinaciones canción+coro+parte+día que sí tienen fila en vocal_audios
        const referencedVocalCombos = new Set();
        try {
            const { data: vocalRows } = await supabaseClient.from('vocal_audios').select('source_song_id,coro_number,part,dia');
            (vocalRows || []).forEach(v => {
                referencedVocalCombos.add(v.source_song_id + '|' + v.coro_number + '|' + (v.part || 'a') + '|' + v.dia);
            });
        } catch (e) {}

        const orphans = [];
        const r2SongIds = [];
        objects.forEach(o => {
            if (o.key.startsWith('songs/')) {
                const songId = parseSongIdFromKey(o.key);
                r2SongIds.push(songId);
                if (songId && !referencedSongIds.has(songId)) orphans.push({ obj: o, tipo: 'Canción', detalle: 'ID: ' + songId });
            } else if (o.key.startsWith('vocal-audios/')) {
                const parts = parseVocalKeyParts(o.key);
                if (parts.sourceSongId && parts.coro && parts.dia) {
                    const combo = parts.sourceSongId + '|' + parts.coro + '|' + (parts.part || 'a') + '|' + parts.dia;
                    if (!referencedVocalCombos.has(combo)) orphans.push({ obj: o, tipo: 'Coro', detalle: 'Coro ' + parts.coro + (parts.part || 'a').toUpperCase() + ' · ' + parts.dia });
                } else {
                    // No se pudo parsear el nombre → no está asignado a ninguna canción → huérfano
                    const filename = o.key.split('/').pop() || o.key;
                    orphans.push({ obj: o, tipo: 'Vocal', detalle: filename });
                }
            }
        });

        console.log('[OrphanDetector] R2 songIds:', r2SongIds);
        console.log('[OrphanDetector] Orphans found:', orphans.length);

        if (orphans.length === 0) {
            c.innerHTML = '<div class="admin-empty">No se encontraron audios huérfanos 🎉</div>';
            return;
        }

        c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Tipo</th><th>Detalle</th><th>Tamaño</th><th>Acción</th></tr></thead><tbody>'
            + orphans.map(({ obj, tipo, detalle }) => {
                const sizeMBVal = ((obj.size || 0) / (1024 * 1024)).toFixed(2);
                const keyEsc = obj.key.replace(/'/g, "\\'");
                return '<tr>'
                    + '<td style="font-size:.72rem">' + tipo + '</td>'
                    + '<td style="font-size:.7rem;color:#a1a1aa">' + esc(detalle) + '</td>'
                    + '<td style="font-size:.72rem">' + sizeMBVal + ' MB</td>'
                    + '<td><button class="btn-danger-sm" onclick="adminDeleteOrphanedAudio(\'' + keyEsc + '\')">🗑️ Borrar</button></td>'
                    + '</tr>';
            }).join('')
            + '</tbody></table></div>'
            + '<div style="margin-top:8px;font-size:.65rem;color:#71717a;text-align:right">' + orphans.length + ' archivo(s) sin ninguna referencia — se puede borrar con seguridad</div>';
    } catch (e) {
        console.error('renderAdminOrphanedAudios error:', e);
        c.innerHTML = '<div class="admin-empty">Error al buscar huérfanos.</div>';
    }
}

async function adminDeleteOrphanedAudio(key) {
    if (!isAdmin()) return;
    if (!confirm('¿Eliminar este archivo huérfano de Storage? Ya se confirmó que ninguna canción, coro o repertorio lo usa.')) return;
    try {
        const deleteUrl = getR2DeleteUrl(key);
        console.log('[OrphanDelete] Deleting:', key, '→ URL:', deleteUrl);
        const response = await r2Fetch(deleteUrl, { method: 'DELETE' });
        console.log('[OrphanDelete] Response:', response.status, response.ok);
        showNotification('Solicitud de eliminación enviada. Refresca para verificar.', 'success');
        logActivity('r2_file_deleted', { key: key, note: 'huérfano' }, 'storage', null);
        r2Cache = null;
        renderAdminOrphanedAudios(true);
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

async function loadR2StorageData(force) {
    if (r2Cache && !force && (Date.now() - r2CacheTime) < 60000) return r2Cache;
    try {
        const res = await r2Fetch(R2_WORKER_URL + '/list');
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
            const match = key.match(/coro(\d+)(?:_([ab]))?_(domingo|lunes)/i);
            if (match) {
                const partLabel = match[2] ? match[2].toUpperCase() : '';
                return '🎤 Coro ' + match[1] + partLabel + ' (' + match[3] + ') de ' + title + ' - ' + artist;
            }
            return '🎤 Audio vocal de ' + title + ' - ' + artist;
        }
        if (isSong) {
            return '🎵 ' + title + ' - ' + artist;
        }
        return '📁 ' + title + ' - ' + artist;
    }

    if (isVocal) {
        const match = key.match(/coro(\d+)(?:_([ab]))?_(domingo|lunes)/i);
        if (match) {
            const partLabel = match[2] ? match[2].toUpperCase() : '';
            return '🎤 Coro ' + match[1] + partLabel + ' (' + match[3] + ') - ID: ' + filename.replace(/\.[^/.]+$/, '');
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
    if (!isAdmin()) { c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>'; return }
    c.innerHTML = '<div class="admin-empty">Cargando datos de almacenamiento...</div>';
    
    const data = await loadR2StorageData(true);
    if (!data || !data.objects) {
        c.innerHTML = '<div class="admin-empty">No se pudieron obtener los archivos del almacenamiento.</div>';
        return;
    }
    
    const objects = data.objects || [];
    const totalBytes = data.totalBytes || 0;
    const STORAGE_LIMIT_GB = 10;
    const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    const usedPct = Math.min(100, (totalBytes / (STORAGE_LIMIT_GB * 1024 * 1024 * 1024)) * 100);
    
    const songs = objects.filter(o => o.key.startsWith('songs/'));
    const vocalAudios = objects.filter(o => o.key.startsWith('vocal-audios/'));
    const helpVideos = objects.filter(o => o.key.startsWith('help_videos/'));
    const songsBytes = songs.reduce((sum, o) => sum + (o.size || 0), 0);
    const vocalBytes = vocalAudios.reduce((sum, o) => sum + (o.size || 0), 0);
    const helpBytes = helpVideos.reduce((sum, o) => sum + (o.size || 0), 0);
    const songsMB = (songsBytes / (1024 * 1024)).toFixed(2);
    const vocalMB = (vocalBytes / (1024 * 1024)).toFixed(2);
    const helpMB = (helpBytes / (1024 * 1024)).toFixed(2);
    
    c.innerHTML = `
        <div class="admin-stat-row">
            <div class="admin-stat-box"><div class="admin-stat-value">${songsMB} MB</div><div class="admin-stat-label">🎵 Canciones</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${vocalMB} MB</div><div class="admin-stat-label">🎤 Audios vocales</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${helpMB} MB</div><div class="admin-stat-label">🎬 Videos de ayuda</div></div>
            <div class="admin-stat-box"><div class="admin-stat-value">${data.count}</div><div class="admin-stat-label">Archivos totales</div></div>
            <div class="admin-stat-box">
                <div class="admin-stat-value">${totalGB} GB</div>
                <div class="admin-stat-label">Espacio total · ${usedPct.toFixed(1)}% de ${STORAGE_LIMIT_GB} GB</div>
                <div class="storage-bar-track"><div class="storage-bar-fill" style="width:${usedPct}%"></div></div>
            </div>
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
            <button class="btn ${storageFilter === 'help' ? 'btn-amber' : 'btn-zinc'}" 
                    onclick="storageFilter = 'help'; renderAdminStorageCategory('help')">🎬 Ayuda</button>
            <button class="btn btn-zinc" onclick="loadR2StorageData(true); renderAdminStorage()">🔄 Refrescar</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <select id="storage-format-filter" class="admin-search-input" style="flex:1;min-width:160px;margin-bottom:0" onchange="storageFormatFilter = this.value; renderAdminStorageCategory(storageFilter)">
                <option value="all">Todos los formatos</option>
                <option value="MP3">MP3 (recomendado convertir)</option>
                <option value="AAC/MP4">AAC / MP4</option>
                <option value="WAV">WAV</option>
                <option value="OGG">OGG</option>
                <option value="Desconocido">Sin detectar aún</option>
            </select>
            <button class="btn btn-zinc" onclick="detectAllVisibleFormats()">🔍 Detectar formatos</button>
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
    else if (category === 'help') objects = objects.filter(o => o.key.startsWith('help_videos/'));
    
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
    
    if (storageFormatFilter !== 'all') {
        objects = objects.filter(o => (audioFormatCache[o.key] || 'Desconocido') === storageFormatFilter);
    }
    
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
                    <th>Formato</th>
                    <th>Tamaño</th>
                    <th>Fecha de subida</th>
                    <th>Acciones</th>
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
                        const isHelp = o.key.startsWith('help_videos/');
                        if (isHelp) displayName = '🎬 Video de ayuda - ' + (o.key.split('/').pop() || o.key);
                        let badge = '';
                        if (isVocal) badge = '<span style="background:rgba(192,132,252,.2);color:#c084fc;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">VOCAL</span>';
                        else if (isSong) badge = '<span style="background:rgba(96,165,250,.2);color:#60a5fa;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">CANCIÓN</span>';
                        else if (isHelp) badge = '<span style="background:rgba(245,158,11,.2);color:#fbbf24;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">AYUDA</span>';
                        else badge = '<span style="background:rgba(161,161,170,.15);color:#a1a1aa;font-size:.6rem;padding:1px 6px;border-radius:4px;margin-right:4px">OTRO</span>';
                        
                        const keyEsc = o.key.replace(/'/g, "\\'");
                        const actionsHtml = isHelp ? '<span style="font-size:.65rem;color:#71717a">Gestionar desde Ayuda</span>' : (isVocal || isSong) ? (
                            '<div style="display:flex;gap:6px;flex-wrap:wrap">'
                            + '<button class="btn-outline-sm" onclick="triggerAdminStorageReplace(\'' + keyEsc + '\')">🔄 Reemplazar</button>'
                            + '<button class="btn-danger-sm" onclick="adminDeleteStorageAudio(\'' + keyEsc + '\')">🗑️ Borrar</button>'
                            + '</div>'
                        ) : '-';
                        
                        const keyEscForFormat = o.key.replace(/'/g, "\\'");
                        const detectedFormat = audioFormatCache[o.key];
                        const formatCell = detectedFormat
                            ? '<span style="font-size:.68rem;font-weight:600;' + (detectedFormat === 'MP3' ? 'color:#fbbf24' : 'color:#4ade80') + '">' + detectedFormat + '</span>'
                            : '<button class="btn-outline-sm" onclick="detectAudioFormat(\'' + keyEscForFormat + '\').then(()=>renderAdminStorageCategory(storageFilter))">🔍</button>';

                        return `<tr>
                            <td>
                                <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                                    ${badge}
                                    <span style="font-size:.78rem;color:#e4e4e7">${displayName}${detailsStr}</span>
                                </div>
                                ${songId !== '—' ? `<div style="font-size:.6rem;color:#52525b;margin-top:2px">ID: ${songId}</div>` : ''}
                            </td>
                            <td>${formatCell}</td>
                            <td style="font-size:.72rem;color:#a1a1aa">${sizeMB(o)} MB</td>
                            <td style="font-size:.7rem;color:#71717a">${formatDate(o.uploaded)}</td>
                            <td>${actionsHtml}</td>
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

// ---------- Borrar / reemplazar audio desde Almacenamiento R2 ----------
function parseVocalKeyParts(key) {
    // El R2 worker agrega un timestamp al inicio: "1787187389145-songId_coro2_lunes.mp3"
    // Necesitamos extraer solo la parte del songId (después del guión que separa el timestamp)
    const filename = key.split('/').pop() || '';
    const withoutExt = filename.replace(/\.[^/.]+$/, '');

    // Buscar el patrón timestamp-songId_coro...
    const match = withoutExt.match(/^(\d+)-(.+?)_coro(\d+)(?:_([ab]))?_(domingo|lunes)$/i);
    if (match) {
        return {
            sourceSongId: match[2],
            coro: parseInt(match[3], 10),
            part: match[4] || 'a',
            dia: match[5]
        };
    }

    // Fallback: formato sin timestamp (legacy)
    const songIdMatch = withoutExt.match(/^(.+?)_coro/i);
    const coroMatch = withoutExt.match(/coro(\d+)(?:_([ab]))?_(domingo|lunes)/i);
    return {
        sourceSongId: songIdMatch ? songIdMatch[1] : null,
        coro: coroMatch ? parseInt(coroMatch[1], 10) : null,
        part: coroMatch ? (coroMatch[2] || 'a') : null,
        dia: coroMatch ? coroMatch[3] : null
    };
}

function parseSongIdFromKey(key) {
    const filename = key.split('/').pop() || '';
    const withoutExt = filename.replace(/\.[^/.]+$/, '');
    // El R2 worker agrega un timestamp al inicio: "1787062021193-songId.mp3"
    // Necesitamos extraer solo la parte del songId después del guión
    const dashIndex = withoutExt.indexOf('-');
    if (dashIndex !== -1) {
        const possibleTimestamp = withoutExt.substring(0, dashIndex);
        // Si la parte antes del guión es solo números (timestamp), quitarla
        if (/^\d+$/.test(possibleTimestamp)) {
            return withoutExt.substring(dashIndex + 1);
        }
    }
    return withoutExt;
}

async function adminDeleteStorageAudio(key) {
    if (!isAdmin() || !supabaseReady) return;
    const isVocal = key.includes('vocal-audios');
    const isSong = key.includes('songs/');
    if (!isVocal && !isSong) return;

    const songData = await resolveSongDataForKey(key);
    const label = songData ? (songData.title + (songData.artist ? ' - ' + songData.artist : '')) : key;
    if (!confirm('¿Eliminar el audio "' + label + '"? Esto lo quitará de la canción/repertorio donde esté vinculado y no se puede deshacer.')) return;

    try {
        // ✅ 1. Eliminar de R2 usando getR2DeleteUrl
        const deleteUrl = getR2DeleteUrl(key);
        console.log('📤 Eliminando de R2:', deleteUrl);
        
        const response = await r2Fetch(deleteUrl, { method: 'DELETE' });
        if (!response.ok) {
            const errorText = await response.text();
            console.warn('⚠️ No se pudo eliminar de R2:', response.status, errorText);
        } else {
            console.log('✅ Archivo eliminado de R2:', key);
        }

        // ✅ 2. Eliminar referencia de la base de datos
        if (isSong) {
            const songId = (songData && songData.id) || parseSongIdFromKey(key);
            
            // Eliminar de canciones_repertorio
            try { 
                await supabaseClient.from('canciones_repertorio').update({ audio_url: null }).eq('source_song_id', songId);
                console.log('✅ Referencia eliminada de canciones_repertorio');
            } catch (e) { console.warn('⚠️ Error actualizando canciones_repertorio:', e.message); }
            
            // Eliminar de user_songs
            try {
                const { data: userSongs } = await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
                if (userSongs) {
                    let updated = 0;
                    for (const us of userSongs) {
                        try {
                            const sd = typeof us.song_data === 'string' ? JSON.parse(us.song_data) : us.song_data;
                            if (sd && (sd.id === songId || sd.sourceId === songId)) {
                                sd.audio_url = null;
                                await supabaseClient.from('user_songs').update({ 
                                    song_data: JSON.stringify(sd), 
                                    updated_at: Date.now() 
                                }).eq('id', us.id);
                                updated++;
                            }
                        } catch (e) {}
                    }
                    console.log('✅ Referencias eliminadas de user_songs:', updated);
                }
            } catch (e) { console.warn('⚠️ Error actualizando user_songs:', e.message); }
            
            logActivity('audio_deleted', { 
                type: 'song', 
                songTitle: (songData && songData.title) || songId 
            }, 'song', songId);
            
        } else if (isVocal) {
            const parts = parseVocalKeyParts(key);
            if (parts.sourceSongId && parts.coro && parts.dia) {
                // Eliminar de vocal_audios
                try {
                    const { error } = await supabaseClient
                        .from('vocal_audios')
                        .delete()
                        .eq('source_song_id', parts.sourceSongId)
                        .eq('coro_number', parts.coro)
                        .eq('dia', parts.dia)
                        .eq('part', parts.part || 'a');
                    
                    if (!error) {
                        console.log('✅ Referencia eliminada de vocal_audios');
                    }
                } catch (e) { 
                    console.warn('⚠️ Error eliminando de vocal_audios:', e.message); 
                }
            }
            try { await loadRepertorios() } catch (e) {}
            logActivity('audio_deleted', { 
                type: 'vocal', 
                coro: parts.coro, 
                part: parts.part,
                dia: parts.dia 
            }, 'vocal', parts.sourceSongId);
        }

        showNotification('Audio eliminado', 'success');
        allSongsCache = null;
        await loadR2StorageData(true);
        renderAdminStorage();
    } catch (e) {
        console.error('❌ Error en adminDeleteStorageAudio:', e);
        alert('Error al eliminar: ' + e.message);
    }
}

let pendingReplaceKey = null;
let pendingReplaceType = null;
let pendingReplaceSongData = null;

async function triggerAdminStorageReplace(key) {
    if (!isAdmin()) return;
    pendingReplaceKey = key;
    pendingReplaceType = key.includes('vocal-audios') ? 'vocal' : 'song';
    pendingReplaceSongData = await resolveSongDataForKey(key);
    document.getElementById('admin-storage-replace-input').click();
}

async function handleAdminStorageReplace(e) {
    const file = e.target.files[0];
    if (!file || !pendingReplaceKey) return;
    if (!supabaseReady) { alert('Sin conexión a Supabase'); e.target.value = ''; return }

    const key = pendingReplaceKey;
    const type = pendingReplaceType;
    const songData = pendingReplaceSongData;

    try {
        // ✅ 1. Eliminar el archivo viejo de R2
        const deleteUrl = getR2DeleteUrl(key);
        console.log('📤 Eliminando archivo viejo:', deleteUrl);
        await r2Fetch(deleteUrl, { method: 'DELETE' });

        if (type === 'song') {
            const songId = (songData && songData.id) || parseSongIdFromKey(key);
            const formData = new FormData();
            formData.append('file', file, songId + '.' + getAudioExtension(file));
            formData.append('folder', 'songs');
            const uploadRes = await r2Fetch(R2_WORKER_URL + '/upload', { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            if (uploadData.error) throw new Error(uploadData.error);
            const audioUrl = normalizeVocalAudioUrl(uploadData.url);
            if (!audioUrl) throw new Error('El worker no devolvió URL');

            await supabaseClient.from('canciones_repertorio').update({ audio_url: audioUrl }).eq('source_song_id', songId);
            const { data: userSongs } = await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
            if (userSongs) {
                for (const us of userSongs) {
                    try {
                        const sd = typeof us.song_data === 'string' ? JSON.parse(us.song_data) : us.song_data;
                        if (sd && (sd.id === songId || sd.sourceId === songId)) {
                            sd.audio_url = audioUrl;
                            await supabaseClient.from('user_songs').update({ song_data: JSON.stringify(sd), updated_at: Date.now() }).eq('id', us.id);
                        }
                    } catch (e) {}
                }
            }
            logActivity('audio_uploaded', { type: 'song', songTitle: (songData && songData.title) || songId, fileSize: file.size }, 'song', songId);
        } else {
            const parts = parseVocalKeyParts(key);
            if (!parts.sourceSongId || !parts.coro || !parts.dia) throw new Error('No se pudo identificar la canción/coro de este archivo.');
            const filename = parts.sourceSongId + '_coro' + parts.coro + '_' + (parts.part || 'a') + '_' + parts.dia + '.' + getAudioExtension(file);
            const storagePath = 'vocal-audios/' + filename;
            const formData = new FormData();
            formData.append('file', file, filename);
            formData.append('folder', 'vocal-audios');
            formData.append('filename', filename);
            const uploadRes = await r2Fetch(R2_WORKER_URL + '/upload', { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();
            if (uploadData.error) throw new Error(uploadData.error);
            let audioUrl = uploadData.url ? normalizeVocalAudioUrl(uploadData.url) : null;
            if (!audioUrl || !audioUrl.includes(parts.sourceSongId)) {
                audioUrl = SUPABASE_URL + '/storage/v1/object/public/vocal-audios/' + storagePath;
            }

            const { data: existingRows } = await supabaseClient.from('vocal_audios').select('id').eq('source_song_id', parts.sourceSongId).eq('coro_number', parts.coro).eq('dia', parts.dia).eq('part', parts.part || 'a');
            if (existingRows && existingRows[0]) {
                await supabaseClient.from('vocal_audios').update({ audio_url: audioUrl, audio_path: storagePath, updated_at: Date.now() }).eq('id', existingRows[0].id);
            }
            try { await loadRepertorios() } catch (e) {}
            logActivity('audio_uploaded', { type: 'vocal', coro: parts.coro, part: parts.part, dia: parts.dia }, 'vocal', parts.sourceSongId);
        }

        showNotification('Audio reemplazado', 'success');
        allSongsCache = null;
        await loadR2StorageData(true);
        renderAdminStorage();
    } catch (err) {
        alert('Error al reemplazar audio: ' + err.message);
    }
    e.target.value = '';
    pendingReplaceKey = null;
    pendingReplaceType = null;
    pendingReplaceSongData = null;
}

// ---------- Enganches sin tocar app.js ----------
if (typeof showPage === 'function') {
    const _adminOriginalShowPage = showPage;
    showPage = function(name) {
        _adminOriginalShowPage(name);
        if (name === 'admin') renderAdminPanel();
        if (name === 'admin-usuarios') initAdminUsuariosPage();
        if (name === 'admin-duplicados') { renderAdminDuplicados(); renderAdminR2Duplicates(); }
        if (name === 'admin-repertorios') renderAdminRepertorios();
        if (name === 'admin-mantenimiento') renderAdminMantenimiento();
        if (name === 'admin-delete-users') { loadAdminUsersData(true).then(() => renderAdminInactiveUsersSection()); }
        if (name === 'admin-storage') renderAdminStorage();
	if (name === 'admin-logs') { logsPage = 0; renderAdminLogs(); }
    };
}

if (typeof updateUserUI === 'function') {
    const _adminOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _adminOriginalUpdateUserUI();
        const navAdmin = document.getElementById('nav-admin');
        if (navAdmin) navAdmin.style.display = (typeof isAdmin === 'function' && (isAdmin() || isSubAdmin())) ? '' : 'none';
    };
}

if (typeof isAdmin === 'function' && (isAdmin() || isSubAdmin())) {
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
let logsPage = 0;
const LOGS_PAGE_SIZE = 50;

async function renderAdminLogs() {
    const c = document.getElementById('admin-logs-content');
    const pagEl = document.getElementById('admin-logs-pagination');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando logs...</div>';
    if (pagEl) pagEl.innerHTML = '';
    
    if (!supabaseReady) {
        c.innerHTML = '<div class="admin-empty">Sin conexión.</div>';
        return;
    }
    
    const actionFilter = document.getElementById('log-filter-action')?.value || '';
    const roleFilter = document.getElementById('log-filter-role')?.value || '';
    const searchTerm = (document.getElementById('log-filter-search')?.value || '').trim().toLowerCase().replace(/^@/, '');
    
    try {
        let query = supabaseClient.from('activity_log').select('*');
        
        if (actionFilter) query = query.eq('action', actionFilter);
        if (roleFilter) query = query.eq('user_role', roleFilter);
        if (searchTerm) query = query.or('user_name.ilike.%' + searchTerm + '%,user_id.ilike.%' + searchTerm + '%');
        
        const from = logsPage * LOGS_PAGE_SIZE;
        const to = from + LOGS_PAGE_SIZE; // pedimos uno extra para saber si hay página siguiente
        
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);
        
        if (error) throw error;
        if (!data || data.length === 0) {
            if (logsPage > 0) {
                // nos pasamos de página (p.ej. tras borrar filtros); retrocedemos una
                logsPage = Math.max(0, logsPage - 1);
                return renderAdminLogs();
            }
            c.innerHTML = '<div class="admin-empty">No hay actividades registradas aún.</div>';
            return;
        }
        
        const hasNext = data.length > LOGS_PAGE_SIZE;
        const pageData = hasNext ? data.slice(0, LOGS_PAGE_SIZE) : data;
        
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
            user_role_changed: '👤 Cambió rol de usuario',
            password_reset: '🔑 Restableció contraseña',
            backfill_created_by: '🛠️ Rellenó "creado por" (mantenimiento)',
            activity_created: '🎉 Creó actividad',
            activity_deleted: '🗑️ Eliminó actividad',
            social_profile_updated: '📝 Actualizó Mis Datos',
            r2_file_deleted: '🧹 Borró duplicado de Storage',
            notification_sent: '📣 Envió notificación',
            notification_deleted: '🗑️ Eliminó notificación',
            notification_reaction_added: '👍 Reaccionó a notificación',
            notification_reaction_removed: '↩️ Quitó reacción',
            user_deleted: '🗑️ Eliminó usuario',
            help_video_added: '🎬 Agregó video de ayuda',
            help_video_updated: '✏️ Editó video de ayuda',
            help_video_deleted: '🗑️ Eliminó video de ayuda'
        };
        
        const roleColors = {
            admin: '#f59e0b',
            D_Musicos: '#60a5fa',
            D_Voces: '#c084fc',
            Social: '#34d399',
            SubAdmin: '#fb7185',
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
                        ${pageData.map(log => {
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
                Página ${logsPage + 1} · ${pageData.length} registros
            </div>
        `;
        
        if (pagEl) {
            pagEl.innerHTML = `
                <button class="admin-page-btn" ${logsPage === 0 ? 'disabled' : ''} onclick="logsPage--; renderAdminLogs()">← Anterior</button>
                <span class="admin-page-label">Página ${logsPage + 1}</span>
                <button class="admin-page-btn" ${!hasNext ? 'disabled' : ''} onclick="logsPage++; renderAdminLogs()">Siguiente →</button>
            `;
        }
    } catch (e) {
        console.error('renderAdminLogs error:', e);
        c.innerHTML = '<div class="admin-empty">Error al cargar logs: ' + e.message + '</div>';
    }
}