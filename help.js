// ============= MÓDULO AYUDA — archivo aparte, no toca app.js / admin.js / social.js =============
// Reutiliza variables/funciones globales ya existentes: currentUser, supabaseClient,
// supabaseReady, isAdmin(), esc(), genId(), showPage(), updateUserUI(), showNotification(),
// logActivity(), R2_WORKER_URL, getR2DeleteUrl().

let helpVideosCache = null;
let viewingHelpVideoId = null;

function canManageHelpVideos() {
    return (typeof isAdmin === 'function' && isAdmin());
}

// ---------- Cargar / listar videos ----------
async function loadHelpVideos(force) {
    if (helpVideosCache && !force) return helpVideosCache;
    if (!supabaseReady) return [];
    try {
        const { data, error } = await supabaseClient.from('help_videos')
            .select('*')
            .order('orden', { ascending: true })
            .order('created_at', { ascending: false });
        if (error || !data) return [];
        helpVideosCache = data;
        return data;
    } catch (e) {
        console.error('loadHelpVideos error:', e);
        return [];
    }
}

// ---------- Página pública "Ayuda" ----------
async function renderAyudaPage(force) {
    const c = document.getElementById('ayuda-content');
    if (!c) return;
    const addBtn = document.getElementById('ayuda-add-btn');
    if (addBtn) addBtn.style.display = canManageHelpVideos() ? '' : 'none';

    c.innerHTML = '<div class="admin-empty">Cargando videos...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }

    const videos = await loadHelpVideos(force);
    if (videos.length === 0) {
        c.innerHTML = '<div class="empty">'
            + '<div class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>'
            + '<h2>Aún no hay videos de ayuda</h2>'
            + '<p>' + (canManageHelpVideos() ? 'Agrega el primero con el botón de arriba' : 'Vuelve pronto, se irán agregando explicaciones') + '</p>'
            + '</div>';
        return;
    }
    c.innerHTML = videos.map(v => {
        return '<div class="help-video-card" onclick="showViewHelpVideoModal(\'' + v.id + '\')">'
            + '<div class="help-video-thumb"><svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>'
            + '<div style="flex:1;min-width:0">'
            + '<div class="card-title">' + esc(v.titulo) + '</div>'
            + '<div class="card-artist">' + esc(v.descripcion || 'Sin descripción') + '</div>'
            + '</div></div>';
    }).join('');
}

// ---------- Modal: agregar video (solo Admin) ----------
function showAddHelpVideoModal() {
    if (!canManageHelpVideos()) return;
    document.getElementById('add-help-video-title').value = '';
    document.getElementById('add-help-video-desc').value = '';
    document.getElementById('add-help-video-file').value = '';
    document.getElementById('add-help-video-error').textContent = '';
    document.getElementById('add-help-video-progress').style.display = 'none';
    const btn = document.getElementById('add-help-video-submit-btn');
    if (btn) btn.disabled = false;
    document.getElementById('add-help-video-modal').classList.add('active');
}
function closeAddHelpVideoModal() {
    document.getElementById('add-help-video-modal').classList.remove('active');
}

async function saveHelpVideo(e) {
    if (e) e.preventDefault();
    if (!canManageHelpVideos() || !supabaseReady) return;

    const titulo = document.getElementById('add-help-video-title').value.trim();
    const descripcion = document.getElementById('add-help-video-desc').value.trim();
    const file = document.getElementById('add-help-video-file').files[0];
    const errorEl = document.getElementById('add-help-video-error');
    errorEl.textContent = '';

    if (!titulo) { errorEl.textContent = 'El título es obligatorio'; return }
    if (!file) { errorEl.textContent = 'Selecciona un video'; return }

    const progressEl = document.getElementById('add-help-video-progress');
    const submitBtn = document.getElementById('add-help-video-submit-btn');
    if (progressEl) progressEl.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;

    try {
        const id = genId();
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
        const filename = id + '.' + ext;

        const formData = new FormData();
        formData.append('file', file, filename);
        formData.append('folder', 'help_videos');
        const uploadRes = await r2Fetch(R2_WORKER_URL + '/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.error) throw new Error(uploadData.error);
        const videoUrl = uploadData.url;
        const videoPath = uploadData.path || ('help_videos/' + filename);

        const creatorName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';

        // Nuevo video al final del orden actual
        let nextOrden = 0;
        try {
            const { data: existing } = await supabaseClient.from('help_videos').select('orden').order('orden', { ascending: false }).limit(1);
            if (existing && existing[0] && typeof existing[0].orden === 'number') nextOrden = existing[0].orden + 1;
        } catch (e) {}

        const { error } = await supabaseClient.from('help_videos').insert({
            id: id,
            titulo: titulo,
            descripcion: descripcion,
            video_url: videoUrl,
            video_path: videoPath,
            orden: nextOrden,
            created_by: creatorName,
            created_by_id: currentUser ? currentUser.id : null,
            created_at: Date.now()
        });
        if (error) throw error;

        closeAddHelpVideoModal();
        helpVideosCache = null;
        r2Cache = null; // el video nuevo debe reflejarse también en Almacenamiento R2
        renderAyudaPage(true);
        showNotification('Video de ayuda agregado', 'success');
        logActivity('help_video_added', { titulo: titulo }, 'help_video', id);
    } catch (err) {
        errorEl.textContent = 'Error al subir: ' + err.message;
    }
    if (progressEl) progressEl.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
}

// ---------- Modal: ver / eliminar video ----------
async function showViewHelpVideoModal(id) {
    const videos = await loadHelpVideos(false);
    const v = videos.find(x => x.id === id);
    if (!v) return;
    viewingHelpVideoId = id;
    const player = document.getElementById('view-help-video-player');
    if (player) { player.src = v.video_url; }
    document.getElementById('view-help-video-title').textContent = v.titulo;
    document.getElementById('view-help-video-desc').textContent = v.descripcion || 'Sin descripción';
    const delBtn = document.getElementById('view-help-video-delete-btn');
    if (delBtn) delBtn.style.display = canManageHelpVideos() ? '' : 'none';
    const editBtn = document.getElementById('view-help-video-edit-btn');
    if (editBtn) editBtn.style.display = canManageHelpVideos() ? '' : 'none';
    document.getElementById('view-help-video-modal').classList.add('active');
}
function closeViewHelpVideoModal() {
    const player = document.getElementById('view-help-video-player');
    if (player) { player.pause(); player.src = ''; }
    document.getElementById('view-help-video-modal').classList.remove('active');
    viewingHelpVideoId = null;
}

// ---------- Editar título/descripción (solo Admin, no toca el archivo de video) ----------
function showEditHelpVideoModal() {
    if (!canManageHelpVideos() || !viewingHelpVideoId) return;
    loadHelpVideos(false).then(videos => {
        const v = videos.find(x => x.id === viewingHelpVideoId);
        if (!v) return;
        document.getElementById('edit-help-video-title').value = v.titulo || '';
        document.getElementById('edit-help-video-desc').value = v.descripcion || '';
        document.getElementById('edit-help-video-error').textContent = '';
        document.getElementById('edit-help-video-modal').classList.add('active');
    });
}
function closeEditHelpVideoModal() {
    document.getElementById('edit-help-video-modal').classList.remove('active');
}
async function saveEditHelpVideo(e) {
    if (e) e.preventDefault();
    if (!canManageHelpVideos() || !viewingHelpVideoId || !supabaseReady) return;
    const titulo = document.getElementById('edit-help-video-title').value.trim();
    const descripcion = document.getElementById('edit-help-video-desc').value.trim();
    const errorEl = document.getElementById('edit-help-video-error');
    errorEl.textContent = '';
    if (!titulo) { errorEl.textContent = 'El título es obligatorio'; return }
    try {
        const { error } = await supabaseClient.from('help_videos').update({ titulo: titulo, descripcion: descripcion }).eq('id', viewingHelpVideoId);
        if (error) throw error;
        closeEditHelpVideoModal();
        helpVideosCache = null;
        // Si el modal de "ver" seguía abierto detrás, refrescamos su texto también
        document.getElementById('view-help-video-title').textContent = titulo;
        document.getElementById('view-help-video-desc').textContent = descripcion || 'Sin descripción';
        renderAyudaPage(true);
        showNotification('Video actualizado', 'success');
        logActivity('help_video_updated', { titulo: titulo }, 'help_video', viewingHelpVideoId);
    } catch (err) {
        errorEl.textContent = 'Error al guardar: ' + err.message;
    }
}

async function deleteHelpVideo() {
    if (!canManageHelpVideos() || !viewingHelpVideoId || !supabaseReady) return;
    const videos = await loadHelpVideos(false);
    const v = videos.find(x => x.id === viewingHelpVideoId);
    if (!confirm('¿Eliminar el video "' + (v ? v.titulo : '') + '"? También se borrará el archivo del almacenamiento (R2). Esta acción no se puede deshacer.')) return;
    try {
        if (v && v.video_path) {
            try { await r2Fetch(getR2DeleteUrl(v.video_path), { method: 'DELETE' }); }
            catch (e) { console.warn('No se pudo eliminar el archivo de R2:', e.message); }
        }
        const { error } = await supabaseClient.from('help_videos').delete().eq('id', viewingHelpVideoId);
        if (error) throw error;

        closeViewHelpVideoModal();
        helpVideosCache = null;
        r2Cache = null;
        renderAyudaPage(true);
        showNotification('Video eliminado', 'success');
        logActivity('help_video_deleted', { titulo: v ? v.titulo : '' }, 'help_video', viewingHelpVideoId);
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

// ---------- Inyectar botón "Ayuda" en el menú de usuario ----------
function injectHelpButton() {
    const dropdownContent = document.getElementById('user-dropdown-content');
    if (!dropdownContent) return;
    if (dropdownContent.querySelector('.ayuda-menu-btn')) return;

    const html = '<button class="user-dropdown-item ayuda-menu-btn" onclick="showPage(\'ayuda\')">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        + 'Ayuda</button>';

    // Con sesión: justo antes de "Cambiar contraseña". Sin sesión (modo local): antes de "Iniciar sesión".
    const pwBtn = dropdownContent.querySelector('button[onclick="showChangePasswordModal()"]');
    if (pwBtn) { pwBtn.insertAdjacentHTML('beforebegin', html); return; }
    const loginBtn = dropdownContent.querySelector('button[onclick="showAuthModal(\'login\')"]');
    if (loginBtn) { loginBtn.insertAdjacentHTML('beforebegin', html); return; }
    dropdownContent.insertAdjacentHTML('beforeend', html);
}

// ---------- Enganches sin tocar app.js / admin.js / social.js ----------
if (typeof showPage === 'function') {
    const _helpOriginalShowPage = showPage;
    showPage = function(name) {
        _helpOriginalShowPage(name);
        if (name === 'ayuda') renderAyudaPage();
    };
}

if (typeof updateUserUI === 'function') {
    const _helpOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _helpOriginalUpdateUserUI();
        injectHelpButton();
    };
}

// Fallback: si la sesión ya estaba restaurada antes de que este script cargara
injectHelpButton();
