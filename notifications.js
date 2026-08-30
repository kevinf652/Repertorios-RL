// ============= MÓDULO NOTIFICACIONES — archivo aparte, no toca app.js/admin.js/social.js =============
const NOTIF_LAST_SEEN_KEY = 'cb_notif_last_seen';
const NOTIF_EXPIRE_DAYS = 7; // notificaciones generales/manuales se autolimpian a los 7 días

let notifCache = null;
let notifCanSendCache = false;

// ---------- Permisos ----------
function canSendNotifications() {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isSubAdmin === 'function' && isSubAdmin()) return true;
    return !!notifCanSendCache;
}

async function refreshCanSendNotifications() {
    notifCanSendCache = false;
    if ((typeof isAdmin === 'function' && isAdmin()) || (typeof isSubAdmin === 'function' && isSubAdmin())) return;
    if (!currentUser || !supabaseReady) return;
    try {
        const { data } = await supabaseClient.from('admin_users').select('puede_notificar').eq('id', currentUser.id).maybeSingle();
        notifCanSendCache = !!(data && data.puede_notificar);
    } catch (e) { console.error('refreshCanSendNotifications error:', e) }
}

// ---------- Carga y limpieza automática ----------
async function loadNotifications(force) {
    if (notifCache && !force) return notifCache;
    if (!supabaseReady) return [];
    try {
        const now = Date.now();
        // Limpieza de paso: borra las que ya vencieron antes de traer la lista
        // (gracias a ON DELETE CASCADE en notification_reactions, sus reacciones se borran solas)
        try { await supabaseClient.from('app_notifications').delete().lt('expires_at', now) } catch (e) {}
        const { data, error } = await supabaseClient.from('app_notifications').select('*').order('created_at', { ascending: false });
        if (error || !data) return [];
        notifCache = data;
        return data;
    } catch (e) {
        console.error('loadNotifications error:', e);
        return [];
    }
}

// ---------- Reacciones (👍🏽 / ❤️) ----------
async function loadReactionsForNotifs(notifIds) {
    const result = {};
    if (!notifIds || notifIds.length === 0 || !supabaseReady) return result;
    try {
        const { data } = await supabaseClient.from('notification_reactions').select('notification_id,user_id,reaction').in('notification_id', notifIds);
        (data || []).forEach(r => {
            if (!result[r.notification_id]) result[r.notification_id] = { like: [], heart: [] };
            if (r.reaction === 'like' || r.reaction === 'heart') result[r.notification_id][r.reaction].push(r.user_id);
        });
    } catch (e) { console.error('loadReactionsForNotifs error:', e) }
    return result;
}

async function toggleNotificationReaction(notifId, reactionType) {
    if (!currentUser || !supabaseReady) return;
    try {
        const { data: existing } = await supabaseClient.from('notification_reactions').select('id').eq('notification_id', notifId).eq('user_id', currentUser.id).eq('reaction', reactionType).maybeSingle();
        if (existing && existing.id) {
            await supabaseClient.from('notification_reactions').delete().eq('id', existing.id);
            if (typeof logActivity === 'function') logActivity('notification_reaction_removed', { reaction: reactionType }, 'notification', notifId);
        } else {
            await supabaseClient.from('notification_reactions').insert({
                id: genId(),
                notification_id: notifId,
                user_id: currentUser.id,
                reaction: reactionType,
                created_at: Date.now()
            });
            if (typeof logActivity === 'function') logActivity('notification_reaction_added', { reaction: reactionType }, 'notification', notifId);
        }
        renderNotificationsPanel();
    } catch (e) {
        console.error('toggleNotificationReaction error:', e);
    }
}

// ---------- Ver quién reaccionó (solo para quien puede enviar notificaciones) ----------
function canViewReactionsFor(notif) {
    if (typeof isAdmin === 'function' && isAdmin()) return true;
    if (typeof isSubAdmin === 'function' && isSubAdmin()) return true;
    // Quien solo tiene autorización puntual, únicamente ve las reacciones de lo que él mismo envió
    return !!(currentUser && notif && notif.created_by_id && notif.created_by_id === currentUser.id);
}

async function loadReactionDetailsForNotif(notifId) {
    const result = { like: [], heart: [] };
    if (!supabaseReady) return result;
    try {
        const { data: reactions } = await supabaseClient.from('notification_reactions').select('user_id,reaction').eq('notification_id', notifId);
        const userIds = [...new Set((reactions || []).map(r => r.user_id))];
        let usersMap = {};
        if (userIds.length > 0) {
            const { data: users } = await supabaseClient.from('admin_users').select('id,nombre,apellido').in('id', userIds);
            (users || []).forEach(u => { usersMap[u.id] = ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.id; });
        }
        (reactions || []).forEach(r => {
            if (result[r.reaction]) result[r.reaction].push(usersMap[r.user_id] || r.user_id);
        });
    } catch (e) { console.error('loadReactionDetailsForNotif error:', e) }
    return result;
}

async function showNotificationReactionsModal(notifId, titulo) {
    if (!canSendNotifications()) return;
    const modal = document.getElementById('notif-reactions-modal');
    const body = document.getElementById('notif-reactions-body');
    if (!modal || !body) return;
    document.getElementById('notif-reactions-title').textContent = titulo || 'Reacciones';
    modal.classList.add('active');

    const notifs = await loadNotifications(false);
    const notif = notifs.find(n => n.id === notifId);
    if (!notif || !canViewReactionsFor(notif)) {
        body.innerHTML = '<div class="admin-empty">Solo puedes ver quién reaccionó a las notificaciones que tú enviaste.</div>';
        return;
    }

    body.innerHTML = '<div class="admin-empty">Cargando...</div>';
    const details = await loadReactionDetailsForNotif(notifId);
    if (details.like.length === 0 && details.heart.length === 0) {
        body.innerHTML = '<div class="admin-empty">Aún nadie ha reaccionado.</div>';
        return;
    }
    const renderGroup = (emoji, label, names) => '<div style="margin-bottom:14px">'
        + '<div style="font-size:.8rem;font-weight:600;color:#e4e4e7;margin-bottom:6px">' + emoji + ' ' + label + ' (' + names.length + ')</div>'
        + (names.length
            ? names.map(n => '<div style="font-size:.78rem;color:#d4d4d8;padding:3px 0">' + esc(n) + '</div>').join('')
            : '<div style="font-size:.72rem;color:#71717a">Nadie aún</div>')
        + '</div>';
    body.innerHTML = renderGroup('👍🏽', 'Le gusta', details.like) + renderGroup('❤️', 'Les encanta', details.heart);
}

function closeNotificationReactionsModal() {
    const modal = document.getElementById('notif-reactions-modal');
    if (modal) modal.classList.remove('active');
}

// Cumpleaños de hoy como notificación "virtual" (no se guarda en la tabla, se calcula al vuelo)
async function getBirthdayVirtualNotifications() {
    if (typeof loadBirthdaysThisMonth !== 'function') return [];
    try {
        const list = await loadBirthdaysThisMonth(false);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return list.filter(u => u.isToday).map(u => {
            const fullName = ((u.nombre || '') + ' ' + (u.apellido || '')).trim() || u.id;
            return {
                id: 'bday-' + u.id + '-' + today.getMonth() + '-' + today.getDate(),
                titulo: '🎂 Cumpleaños',
                cuerpo: fullName + ' cumple años hoy',
                created_by: null,
                created_at: today.getTime(),
                tipo: 'cumpleanos'
            };
        });
    } catch (e) { return [] }
}

// ---------- Bienvenida a usuario nuevo (100% local, personal, se autoborra) ----------
const WELCOME_PENDING_KEY = 'cb_notif_welcome_pending';
const WELCOME_HOURS = 48; // cuántas horas dura visible la bienvenida

function markPendingWelcome(username) {
    localStorage.setItem(WELCOME_PENDING_KEY, username);
}

// Si el usuario que acaba de iniciar sesión es quien se acaba de registrar, crea su bienvenida local
function maybeCreateWelcomeNotification() {
    if (!currentUser) return;
    const pending = localStorage.getItem(WELCOME_PENDING_KEY);
    if (pending && pending === currentUser.id) {
        const nombre = currentUser.nombre || currentUser.id;
        const data = {
            id: 'welcome-' + currentUser.id,
            titulo: '¡Bienvenido a Repertorios RL, ' + nombre + '! 🥳',
            cuerpo: 'Qué bueno tenerte por acá. Unos tips para arrancar:\n📖 Guarda tus canciones en tu biblioteca personal\n📅 Revisa los repertorios de Domingo y Lunes\n👤 Completa "Mis Datos" para que el equipo te conozca mejor\n¡Cualquier duda, aquí estamos!',
            created_by: null,
            created_at: Date.now(),
            expires_at: Date.now() + WELCOME_HOURS * 60 * 60 * 1000,
            tipo: 'bienvenida'
        };
        localStorage.setItem('cb_notif_welcome_' + currentUser.id, JSON.stringify(data));
        localStorage.removeItem(WELCOME_PENDING_KEY);
    }
}

// Devuelve la bienvenida local si existe y sigue vigente (solo la ve ese usuario, en ese dispositivo)
function getLocalWelcomeNotification() {
    if (!currentUser) return null;
    const key = 'cb_notif_welcome_' + currentUser.id;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!data.expires_at || Date.now() > data.expires_at) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
    }
}

// ---------- Punto de notificación en la campanita ----------
async function updateNotificationBellDot() {
    const bell = document.getElementById('notif-bell-btn');
    if (!bell) return;
    let hasNotif = false;
    if (getLocalWelcomeNotification()) hasNotif = true;
    if (!hasNotif) {
        try {
            const birthdays = await getBirthdayVirtualNotifications();
            if (birthdays.length > 0) hasNotif = true;
        } catch (e) {}
    }
    if (!hasNotif && supabaseReady) {
        try {
            const notifs = await loadNotifications(false);
            const lastSeen = parseInt(localStorage.getItem(NOTIF_LAST_SEEN_KEY) || '0', 10);
            if (notifs.some(n => (n.created_at || 0) > lastSeen)) hasNotif = true;
        } catch (e) {}
    }
    let dot = bell.querySelector('.bell-dot');
    if (hasNotif && !dot) {
        dot = document.createElement('span');
        dot.className = 'bell-dot';
        bell.appendChild(dot);
    } else if (!hasNotif && dot) {
        dot.remove();
    }
}

function markNotificationsSeen(notifs) {
    const maxTs = (notifs || []).reduce((m, n) => Math.max(m, n.created_at || 0), 0);
    localStorage.setItem(NOTIF_LAST_SEEN_KEY, String(maxTs || Date.now()));
    updateNotificationBellDot();
}

// ---------- Panel deslizante ----------
async function openNotificationsPanel() {
    const panel = document.getElementById('notifications-panel');
    const backdrop = document.getElementById('notifications-backdrop');
    if (!panel || !backdrop) return;
    backdrop.classList.add('active');
    panel.classList.add('active');
    await renderNotificationsPanel();
}

function closeNotificationsPanel() {
    const panel = document.getElementById('notifications-panel');
    const backdrop = document.getElementById('notifications-backdrop');
    if (panel) panel.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
}

async function renderNotificationsPanel() {
    const list = document.getElementById('notifications-list');
    const sendBtnWrap = document.getElementById('notif-send-btn-wrap');
    if (!list) return;
    list.innerHTML = '<div class="admin-empty">Cargando...</div>';
    await refreshCanSendNotifications();
    if (sendBtnWrap) sendBtnWrap.style.display = canSendNotifications() ? '' : 'none';

    const birthdays = await getBirthdayVirtualNotifications();
    const welcome = getLocalWelcomeNotification();
    const dbNotifs = await loadNotifications(true);
    const all = [...(welcome ? [welcome] : []), ...birthdays, ...dbNotifs].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const reactionsByNotif = await loadReactionsForNotifs(dbNotifs.map(n => n.id));

    if (all.length === 0) {
        list.innerHTML = '<div class="admin-empty">No hay notificaciones por ahora 🔔</div>';
    } else {
        list.innerHTML = all.map(n => {
            const when = n.created_at ? new Date(n.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            const isSystem = n.tipo === 'sistema' || n.tipo === 'cumpleanos' || n.tipo === 'bienvenida';
            const canReact = !!currentUser && n.tipo !== 'cumpleanos' && n.tipo !== 'bienvenida';
            const rx = reactionsByNotif[n.id] || { like: [], heart: [] };
            const iReactedLike = currentUser && rx.like.includes(currentUser.id);
            const iReactedHeart = currentUser && rx.heart.includes(currentUser.id);
            const reactionsHtml = canReact
                ? '<div class="notif-item-reactions">'
                    + '<button class="notif-reaction-btn' + (iReactedLike ? ' active' : '') + '" onclick="event.stopPropagation();toggleNotificationReaction(\'' + n.id + '\',\'like\')">👍🏽 ' + (rx.like.length || '') + '</button>'
                    + '<button class="notif-reaction-btn' + (iReactedHeart ? ' active' : '') + '" onclick="event.stopPropagation();toggleNotificationReaction(\'' + n.id + '\',\'heart\')">❤️ ' + (rx.heart.length || '') + '</button>'
                    + '</div>'
                : '';
            const isVirtual = n.tipo === 'cumpleanos' || n.tipo === 'bienvenida';
            const isRealDbNotif = !isVirtual;
            const canClickToSeeReactions = isRealDbNotif && canSendNotifications();
            const titleEsc = esc(n.titulo).replace(/'/g, "\\'");
            return '<div class="notif-item' + (isSystem ? ' notif-item-system' : '') + (canClickToSeeReactions ? ' notif-item-clickable' : '') + '"' + (canClickToSeeReactions ? ' onclick="showNotificationReactionsModal(\'' + n.id + '\',\'' + titleEsc + '\')"' : '') + '>'
                + '<div class="notif-item-title">' + esc(n.titulo) + '</div>'
                + (n.cuerpo ? '<div class="notif-item-body">' + esc(n.cuerpo) + '</div>' : '')
                + '<div class="notif-item-meta">' + (n.created_by ? esc(n.created_by) + ' · ' : '') + when + '</div>'
                + reactionsHtml
                + '</div>';
        }).join('');
    }

    markNotificationsSeen(dbNotifs.concat(birthdays));
}

// ---------- Envío manual ----------
function showSendNotificationModal() {
    if (!canSendNotifications()) return;
    document.getElementById('send-notif-title').value = '';
    document.getElementById('send-notif-body').value = '';
    document.getElementById('send-notification-modal').classList.add('active');
}

function closeSendNotificationModal() {
    document.getElementById('send-notification-modal').classList.remove('active');
}

async function submitSendNotification(e) {
    if (e) e.preventDefault();
    if (!canSendNotifications() || !supabaseReady) return;
    const titulo = document.getElementById('send-notif-title').value.trim();
    const cuerpo = document.getElementById('send-notif-body').value.trim();
    if (!titulo) { alert('El título es obligatorio'); return }
    const creatorName = currentUser ? (currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id) : '';
    const now = Date.now();
    try {
        const { error } = await supabaseClient.from('app_notifications').insert({
            id: genId(),
            titulo: titulo,
            cuerpo: cuerpo,
            tipo: 'manual',
            created_by: creatorName,
            created_by_id: currentUser ? currentUser.id : null,
            created_at: now,
            expires_at: now + NOTIF_EXPIRE_DAYS * 24 * 60 * 60 * 1000
        });
        if (error) throw error;
        closeSendNotificationModal();
        showNotification('Notificación enviada', 'success');
        if (typeof logActivity === 'function') logActivity('notification_sent', { titulo: titulo }, 'notification', null);
        notifCache = null;
        await renderNotificationsPanel();
    } catch (err) {
        alert('Error al enviar: ' + err.message);
    }
}

// Notificación automática: repertorio nuevo (se engancha a createRepertorio sin tocar app.js)
async function notifyNewRepertorio(titulo) {    if (!supabaseReady) return;
    const now = Date.now();
    try {
        await supabaseClient.from('app_notifications').insert({
            id: genId(),
            titulo: '📅 Nuevo repertorio',
            cuerpo: 'Se creó el repertorio "' + titulo + '"',
            tipo: 'sistema',
            created_by: null,
            created_at: now,
            expires_at: now + NOTIF_EXPIRE_DAYS * 24 * 60 * 60 * 1000
        });
        notifCache = null;
        updateNotificationBellDot();
    } catch (e) { console.error('notifyNewRepertorio error:', e) }
}

// ---------- Admin: gestión de notificaciones activas (solo Admin, no Subadmin) ----------
async function renderAdminNotificaciones() {
    const c = document.getElementById('admin-notificaciones-content');
    if (!c) return;
    if (typeof isAdmin !== 'function' || !isAdmin()) {
        c.innerHTML = '<div class="admin-empty">No tienes permisos para ver esta sección.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-empty">Cargando...</div>';
    if (!supabaseReady) { c.innerHTML = '<div class="admin-empty">Sin conexión.</div>'; return }
    const notifs = await loadNotifications(true);
    if (notifs.length === 0) {
        c.innerHTML = '<div class="admin-empty">No hay notificaciones activas por ahora.</div>';
        return;
    }
    c.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Título</th><th>Cuerpo</th><th>Tipo</th><th>Creado por</th><th>Vence</th><th>Acción</th>'
        + '</tr></thead><tbody>'
        + notifs.map(n => {
            const expDate = n.expires_at ? new Date(n.expires_at).toISOString().split('T')[0] : '';
            const tipoLabel = n.tipo === 'sistema' ? '⚙️ Sistema' : '✍️ Manual';
            return '<tr>'
                + '<td style="font-size:.78rem;max-width:150px">' + esc(n.titulo) + '</td>'
                + '<td style="font-size:.72rem;color:#a1a1aa;max-width:200px">' + esc(n.cuerpo || '-') + '</td>'
                + '<td style="font-size:.7rem;white-space:nowrap">' + tipoLabel + '</td>'
                + '<td style="font-size:.72rem">' + esc(n.created_by || '-') + '</td>'
                + '<td><input type="date" value="' + expDate + '" onchange="updateNotificationExpiry(\'' + n.id + '\', this.value)" style="background:#27272a;border:1px solid rgba(63,63,70,.6);color:#e4e4e7;border-radius:6px;padding:3px 6px;font-size:.72rem"></td>'
                + '<td><button class="btn-danger-sm" onclick="deleteAdminNotification(\'' + n.id + '\')">🗑️ Borrar</button></td>'
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
}

async function deleteAdminNotification(id) {
    if (typeof isAdmin !== 'function' || !isAdmin() || !supabaseReady) return;
    if (!confirm('¿Eliminar esta notificación antes de tiempo? Ya no se mostrará a nadie.')) return;
    try {
        const { error } = await supabaseClient.from('app_notifications').delete().eq('id', id);
        if (error) throw error;
        showNotification('Notificación eliminada', 'success');
        notifCache = null;
        renderAdminNotificaciones();
        updateNotificationBellDot();
        if (typeof logActivity === 'function') logActivity('notification_deleted', { titulo: id }, 'notification', id);
    } catch (e) {
        alert('Error al eliminar: ' + e.message);
    }
}

async function updateNotificationExpiry(id, dateValue) {
    if (typeof isAdmin !== 'function' || !isAdmin() || !supabaseReady || !dateValue) return;
    const newExpiry = new Date(dateValue + 'T23:59:59').getTime();
    try {
        const { error } = await supabaseClient.from('app_notifications').update({ expires_at: newExpiry }).eq('id', id);
        if (error) throw error;
        showNotification('Fecha de vencimiento actualizada', 'success');
        notifCache = null;
    } catch (e) {
        alert('Error al actualizar: ' + e.message);
        renderAdminNotificaciones();
    }
}

// ---------- Enganches sin tocar app.js/admin.js/social.js ----------
if (typeof createRepertorio === 'function') {
    const _notifOriginalCreateRepertorio = createRepertorio;
    createRepertorio = async function() {
        const before = (typeof repertorios !== 'undefined') ? repertorios.length : 0;
        await _notifOriginalCreateRepertorio();
        const after = (typeof repertorios !== 'undefined') ? repertorios.length : 0;
        if (after > before && repertorios[0]) {
            notifyNewRepertorio(repertorios[0].titulo);
        }
    };
}

if (typeof updateUserUI === 'function') {
    const _notifOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _notifOriginalUpdateUserUI();
        maybeCreateWelcomeNotification();
        refreshCanSendNotifications().then(updateNotificationBellDot);
    };
}

if (typeof handleRegister === 'function') {
    const _notifOriginalHandleRegister = handleRegister;
    handleRegister = async function(e) {
        const usernameField = document.getElementById('reg-username');
        const attemptedUsername = usernameField ? usernameField.value.trim().toLowerCase() : null;
        await _notifOriginalHandleRegister(e);
        // El registro exitoso deja precargado el mismo usuario en el campo de login
        const loginField = document.getElementById('login-username');
        if (attemptedUsername && loginField && loginField.value === attemptedUsername) {
            markPendingWelcome(attemptedUsername);
        }
    };
}

if (typeof showPage === 'function') {
    const _notifOriginalShowPage = showPage;
    showPage = function(name) {
        _notifOriginalShowPage(name);
        if (name === 'admin-notificaciones') renderAdminNotificaciones();
    };
}

updateNotificationBellDot();
