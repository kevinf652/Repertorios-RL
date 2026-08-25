// ============= MÓDULO SOCIAL — archivo aparte, no toca app.js ni admin.js =============
let socialUsersCache = null;
let socialActivitiesCache = null;
let viewingActivityId = null;

function isSocial() {
    return userRole === 'Social';
}
function canAccessSocial() {
    return (typeof isAdmin === 'function' && isAdmin()) || isSocial();
}

// ---------- Menú principal ----------
function renderSocialPanel() {
    const c = document.getElementById('social-content');
    if (!c) return;
    if (!canAccessSocial()) {
        c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-cards-grid">'
        + adminCardHtml('social-usuarios', 'Información de usuarios', 'Datos del formulario de bienvenida', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>')
        + adminCardHtml('social-actividades', 'Actividades', 'Propuestas para el grupo', '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/></svg>')
        + '</div>';
}

// ---------- Información de usuarios ----------
async function loadSocialUsersData(force) {
    if (socialUsersCache && !force) return socialUsersCache;
    if (!supabaseReady) return [];
    try {
        const { data: users, error } = await supabaseClient.from('admin_users').select('id,nombre,apellido').order('nombre', { ascending: true });
        if (error || !users) return [];
        const { data: profiles } = await supabaseClient.from('social_profiles').select('*');
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.user_id] = p });
        socialUsersCache = users.map(u => Object.assign({}, u, { profile: profileMap[u.id] || {} }));
        return socialUsersCache;
    } catch (e) {
        console.error('loadSocialUsersData error:', e);
        return [];
    }
}

async function renderSocialUsuarios(force) {
    const c = document.getElementById('social-usuarios-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    const users = await loadSocialUsersData(force);
    if (users.length === 0) {
        c.innerHTML = '<div class="admin-empty">No hay usuarios registrados.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Nombre</th><th>Cumpleaños</th><th>Color fav.</th><th>Comida fav.</th><th>Pastel/Pizza</th><th>Instrumento/Rol</th><th>Qué mejorar</th>'
        + '</tr></thead><tbody>'
        + users.map(u => {
            const p = u.profile || {};
            const fullName = ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.id;
            return '<tr>'
                + '<td>' + esc(fullName) + '<br><span style="color:#71717a;font-size:.68rem">@' + esc(u.id) + '</span></td>'
                + '<td style="font-size:.72rem;white-space:nowrap">' + (p.fecha_cumpleanos ? fmtShortDate(p.fecha_cumpleanos) : '-') + '</td>'
                + '<td style="font-size:.72rem">' + esc(p.color_favorito || '-') + '</td>'
                + '<td style="font-size:.72rem">' + esc(p.comida_favorita || '-') + '</td>'
                + '<td style="font-size:.72rem">' + esc(p.pastel_o_pizza || '-') + '</td>'
                + '<td style="font-size:.72rem">' + esc(p.instrumento_rol || '-') + '</td>'
                + '<td style="font-size:.7rem;color:#a1a1aa;max-width:220px">' + esc(p.mejorar_grupo || '-') + '</td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

// ---------- Actividades ----------
async function loadSocialActivities(force) {
    if (socialActivitiesCache && !force) return socialActivitiesCache;
    if (!supabaseReady) return [];
    try {
        const { data, error } = await supabaseClient.from('social_activities').select('*').order('fecha', { ascending: true });
        if (error || !data) return [];
        socialActivitiesCache = data;
        return data;
    } catch (e) {
        console.error('loadSocialActivities error:', e);
        return [];
    }
}

async function renderSocialActividades(force) {
    const c = document.getElementById('social-actividades-content');
    if (!c) return;
    c.innerHTML = '<div class="admin-empty">Cargando...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    const activities = await loadSocialActivities(force);
    if (activities.length === 0) {
        c.innerHTML = '<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/></svg></div><h2>Sin actividades aún</h2><p>Propón la primera idea para el grupo</p></div>';
        return;
    }
    c.innerHTML = activities.map(a => {
        return '<div class="card" onclick="showViewActivityModal(\'' + a.id + '\')" style="margin-bottom:10px">'
            + '<div style="display:flex;justify-content:space-between;gap:8px">'
            + '<div style="flex:1;min-width:0">'
            + '<div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z"/></svg> ' + esc(a.titulo) + '</div>'
            + '<div class="card-artist">' + (a.fecha ? fmtShortDate(a.fecha) : 'Sin fecha') + '</div>'
            + '<div class="card-meta"><span class="tag tag-zinc">Creado por ' + esc(a.created_by || '-') + '</span></div>'
            + '</div></div></div>';
    }).join('');
}

function showAddActivityModal() {
    if (!canAccessSocial()) return;
    document.getElementById('add-activity-title').value = '';
    document.getElementById('add-activity-fecha').value = '';
    document.getElementById('add-activity-desc').value = '';
    document.getElementById('add-activity-modal').classList.add('active');
}
function closeAddActivityModal() {
    document.getElementById('add-activity-modal').classList.remove('active');
}

async function saveActivity(e) {
    if (e) e.preventDefault();
    if (!canAccessSocial() || !supabaseReady) return;
    const titulo = document.getElementById('add-activity-title').value.trim();
    const fecha = document.getElementById('add-activity-fecha').value;
    const descripcion = document.getElementById('add-activity-desc').value.trim();
    if (!titulo) { alert('El título es obligatorio'); return }
    const id = genId();
    const creatorName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
    try {
        const { error } = await supabaseClient.from('social_activities').insert({
            id: id,
            titulo: titulo,
            fecha: fecha || null,
            descripcion: descripcion,
            created_by: creatorName,
            created_by_id: currentUser ? currentUser.id : null,
            created_at: Date.now()
        });
        if (error) throw error;
        closeAddActivityModal();
        renderSocialActividades(true);
        showNotification('Actividad agregada', 'success');
        logActivity('activity_created', { titulo: titulo, fecha: fecha }, 'social_activity', id);
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

async function showViewActivityModal(id) {
    const activities = await loadSocialActivities(false);
    const a = activities.find(x => x.id === id);
    if (!a) return;
    viewingActivityId = id;
    document.getElementById('view-activity-title').textContent = a.titulo;
    document.getElementById('view-activity-fecha').textContent = a.fecha ? fmtShortDate(a.fecha) : 'Sin fecha';
    document.getElementById('view-activity-desc').textContent = a.descripcion || 'Sin descripción';
    document.getElementById('view-activity-creator').textContent = 'Creado por ' + (a.created_by || '-');
    document.getElementById('view-activity-delete-btn').style.display = canAccessSocial() ? '' : 'none';
    document.getElementById('view-activity-modal').classList.add('active');
}
function closeViewActivityModal() {
    document.getElementById('view-activity-modal').classList.remove('active');
    viewingActivityId = null;
}
async function deleteActivity() {
    if (!canAccessSocial() || !viewingActivityId || !supabaseReady) return;
    const activities = await loadSocialActivities(false);
    const a = activities.find(x => x.id === viewingActivityId);
    if (!confirm('¿Eliminar la actividad "' + (a ? a.titulo : '') + '"? Esta acción no se puede deshacer.')) return;
    try {
        const { error } = await supabaseClient.from('social_activities').delete().eq('id', viewingActivityId);
        if (error) throw error;
        closeViewActivityModal();
        renderSocialActividades(true);
        showNotification('Actividad eliminada', 'success');
        logActivity('activity_deleted', { titulo: a ? a.titulo : '' }, 'social_activity', viewingActivityId);
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

// ---------- Mis Datos ----------
async function renderMisDatos() {
    if (!currentUser) return;
    const nameEl = document.getElementById('md-nombre-completo');
    if (nameEl) nameEl.textContent = ((currentUser.nombre || '') + ' ' + (currentUser.apellido || '')).trim() || currentUser.id;
    const userEl = document.getElementById('md-usuario');
    if (userEl) userEl.textContent = '@' + currentUser.id;

    let profile = {};
    if (supabaseReady) {
        try {
            const { data } = await supabaseClient.from('social_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
            if (data) profile = data;
        } catch (e) { console.error('renderMisDatos load error:', e) }
    }
    document.getElementById('md-cumpleanos').value = profile.fecha_cumpleanos || '';
    document.getElementById('md-color').value = profile.color_favorito || '';
    document.getElementById('md-comida').value = profile.comida_favorita || '';
    document.getElementById('md-pastel-pizza').value = profile.pastel_o_pizza || '';
    document.getElementById('md-instrumento').value = profile.instrumento_rol || '';
    document.getElementById('md-mejorar').value = profile.mejorar_grupo || '';
}

async function saveMisDatos(e) {
    if (e) e.preventDefault();
    if (!currentUser) { alert('Debes iniciar sesión para guardar tus datos.'); return }
    if (!supabaseReady) { alert('Sin conexión.'); return }
    const payload = {
        user_id: currentUser.id,
        fecha_cumpleanos: document.getElementById('md-cumpleanos').value || null,
        color_favorito: document.getElementById('md-color').value.trim(),
        comida_favorita: document.getElementById('md-comida').value.trim(),
        pastel_o_pizza: document.getElementById('md-pastel-pizza').value,
        instrumento_rol: document.getElementById('md-instrumento').value.trim(),
        mejorar_grupo: document.getElementById('md-mejorar').value.trim(),
        updated_at: Date.now()
    };
    try {
        const { error } = await supabaseClient.from('social_profiles').upsert(payload, { onConflict: 'user_id' });
        if (error) throw error;
        showNotification('Tus datos se guardaron', 'success');
        socialUsersCache = null;
        logActivity('social_profile_updated', {}, 'social_profile', currentUser.id);
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

// ---------- Enganches sin tocar app.js ni admin.js ----------
if (typeof showPage === 'function') {
    const _socialOriginalShowPage = showPage;
    showPage = function(name) {
        _socialOriginalShowPage(name);
        if (name === 'social') renderSocialPanel();
        if (name === 'social-usuarios') renderSocialUsuarios(true);
        if (name === 'social-actividades') renderSocialActividades(true);
        if (name === 'mis-datos') renderMisDatos();
    };
}

if (typeof updateUserUI === 'function') {
    const _socialOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _socialOriginalUpdateUserUI();
        const navSocial = document.getElementById('nav-social');
        if (navSocial) navSocial.style.display = canAccessSocial() ? '' : 'none';

        // Inyectar botón "Mis Datos" en el menú de usuario, antes de "Cambiar contraseña"
        const dropdownContent = document.getElementById('user-dropdown-content');
        if (dropdownContent && currentUser) {
            const pwBtn = dropdownContent.querySelector('button[onclick="showChangePasswordModal()"]');
            if (pwBtn && !dropdownContent.querySelector('.mis-datos-btn')) {
                pwBtn.insertAdjacentHTML('beforebegin',
                    '<button class="user-dropdown-item mis-datos-btn" onclick="showPage(\'mis-datos\')">'
                    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
                    + 'Mis Datos</button>');
            }
        }
    };
}

if (canAccessSocial()) {
    const navSocial = document.getElementById('nav-social');
    if (navSocial) navSocial.style.display = '';
}
