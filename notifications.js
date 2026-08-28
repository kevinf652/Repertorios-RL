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

// ---------- Punto de notificación en la campanita ----------
async function updateNotificationBellDot() {
    const bell = document.getElementById('notif-bell-btn');
    if (!bell) return;
    let hasNotif = false;
    try {
        const birthdays = await getBirthdayVirtualNotifications();
        if (birthdays.length > 0) hasNotif = true;
    } catch (e) {}
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
    const dbNotifs = await loadNotifications(true);
    const all = [...birthdays, ...dbNotifs].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    if (all.length === 0) {
        list.innerHTML = '<div class="admin-empty">No hay notificaciones por ahora 🔔</div>';
    } else {
        list.innerHTML = all.map(n => {
            const when = n.created_at ? new Date(n.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            const isSystem = n.tipo === 'sistema' || n.tipo === 'cumpleanos';
            return '<div class="notif-item' + (isSystem ? ' notif-item-system' : '') + '">'
                + '<div class="notif-item-title">' + esc(n.titulo) + '</div>'
                + (n.cuerpo ? '<div class="notif-item-body">' + esc(n.cuerpo) + '</div>' : '')
                + '<div class="notif-item-meta">' + (n.created_by ? esc(n.created_by) + ' · ' : '') + when + '</div>'
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
async function notifyNewRepertorio(titulo) {
    if (!supabaseReady) return;
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
        refreshCanSendNotifications().then(updateNotificationBellDot);
    };
}

updateNotificationBellDot();
