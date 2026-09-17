// ============= MÓDULO NOTIFICACIONES — archivo aparte, no toca app.js/admin.js/social.js =============
const NOTIF_LAST_SEEN_KEY = 'cb_notif_last_seen';
const NOTIF_EXPIRE_DAYS = 7; // notificaciones generales/manuales se autolimpian a los 7 días

let notifCache = null;
let notifCanSendCache = false;

// ---------- Permisos ----------
function canSendNotifications() {
    if (!isOnline) return false;
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
        // La limpieza también es una escritura: nunca se intenta en modo offline.
        // (gracias a ON DELETE CASCADE en notification_reactions, sus reacciones se borran solas)
        if (isOnline) {
            try { await supabaseClient.from('app_notifications').delete().lt('expires_at', now) } catch (e) {}
        }
        const { data, error } = await supabaseClient.from('app_notifications').select('*').order('created_at', { ascending: false });
        if (error || !data) return [];
        notifCache = data;
        return data;
    } catch (e) {
        console.error('loadNotifications error:', e);
        return [];
    }
}

// ---------- Compartidos privados ----------
let sharedItemsCache = null;
const SHARED_LIFECYCLE_ACTIVE = 'active';
const SHARED_LIFECYCLE_EXPIRED = 'expired';

function sharedItemLifecycle(item, now) {
    if (!item) return SHARED_LIFECYCLE_EXPIRED;
    if (item.lifecycle_status === SHARED_LIFECYCLE_EXPIRED) return SHARED_LIFECYCLE_EXPIRED;
    return item.expires_at && item.expires_at <= now ? SHARED_LIFECYCLE_EXPIRED : SHARED_LIFECYCLE_ACTIVE;
}

async function loadSharedItems(force) {
    if (!currentUser || !supabaseReady) return [];
    if (sharedItemsCache && !force) return sharedItemsCache;
    try {
        const now = Date.now();
        // Nunca se borra un compartido desde la carga del usuario. Los vencidos
        // se conservan para que Admin pueda revisarlos y purgarlos después.
        const { data, error } = await supabaseClient.from('app_shared_items')
            .select('*')
            .eq('recipient_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (error || !data) return [];

        const rows = data.map(item => ({ ...item, lifecycle_status: sharedItemLifecycle(item, now) }));

        // Las filas antiguas o que acaban de vencer se marcan sin borrar. La
        // condición de fecha sigue siendo la fuente de verdad si una escritura
        // puntual no pudiera completarse.
        const justExpiredIds = data
            .filter(item => item.lifecycle_status !== SHARED_LIFECYCLE_EXPIRED && item.expires_at && item.expires_at <= now)
            .map(item => item.id);
        if (isOnline && justExpiredIds.length > 0) {
            try {
                const { error: expiryError } = await supabaseClient.from('app_shared_items')
                    .update({ lifecycle_status: SHARED_LIFECYCLE_EXPIRED, expired_at: now, expired_reason: 'timeout' })
                    .eq('recipient_id', currentUser.id)
                    .in('id', justExpiredIds);
                if (!expiryError) rows.forEach(item => {
                    if (justExpiredIds.includes(item.id)) {
                        item.lifecycle_status = SHARED_LIFECYCLE_EXPIRED;
                        item.expired_at = now;
                        item.expired_reason = 'timeout';
                    }
                });
            } catch (e) { console.warn('No se pudieron marcar compartidos vencidos:', e.message) }
        }

        sharedItemsCache = rows.filter(item => sharedItemLifecycle(item, now) === SHARED_LIFECYCLE_ACTIVE);
        return sharedItemsCache;
    } catch (e) {
        console.error('loadSharedItems error:', e);
        return [];
    }
}

function invalidateSharedItemsCache() { sharedItemsCache = null; }

async function getSharedItemById(id) {
    const cached = (sharedItemsCache || []).find(item => item.id === id);
    if (cached) return cached;
    if (!supabaseReady || !currentUser) return null;
    const { data, error } = await supabaseClient.from('app_shared_items').select('*').eq('id', id).eq('recipient_id', currentUser.id).maybeSingle();
    if (error || !data) return null;
    return data;
}

async function markSharedItemViewed(id) {
    if (!currentUser || !supabaseReady || !id) return;
    try {
        await supabaseClient.from('app_shared_items').update({ status: 'viewed', viewed_at: Date.now() })
            .eq('id', id).eq('recipient_id', currentUser.id).eq('status', 'pending').eq('lifecycle_status', SHARED_LIFECYCLE_ACTIVE);
        invalidateSharedItemsCache();
    } catch (e) { console.error('markSharedItemViewed error:', e) }
}

async function markSharedItemAccepted(id) {
    if (!currentUser || !supabaseReady || !id) return;
    try {
        await supabaseClient.from('app_shared_items').update({ status: 'accepted', accepted_at: Date.now() })
            .eq('id', id).eq('recipient_id', currentUser.id).eq('lifecycle_status', SHARED_LIFECYCLE_ACTIVE);
        invalidateSharedItemsCache();
        updateNotificationBellDot();
    } catch (e) { console.error('markSharedItemAccepted error:', e) }
}

async function dismissSharedItem(id) {
    if (!currentUser || !supabaseReady || !id || blockIfOffline()) return;
    if (!confirm('¿Quitar esta notificación? El compartido desaparecerá de tu panel y quedará como vencido para Admin.')) return;
    try {
        const item = await getSharedItemById(id);
        const now = Date.now();
        const { error } = await supabaseClient.from('app_shared_items').update({
            lifecycle_status: SHARED_LIFECYCLE_EXPIRED,
            expired_at: now,
            expired_reason: 'user_dismissed'
        }).eq('id', id).eq('recipient_id', currentUser.id).eq('lifecycle_status', SHARED_LIFECYCLE_ACTIVE);
        if (error) throw error;
        invalidateSharedItemsCache();
        if (typeof logActivity === 'function') logActivity('shared_item_dismissed', {
            title: item ? item.title : '',
            type: item ? item.item_type : '',
            status: SHARED_LIFECYCLE_EXPIRED,
            reason: 'user_dismissed'
        }, 'shared_item', id);
        await renderNotificationsPanel();
        showNotification('Notificación quitada.', 'success');
    } catch (e) {
        showNotification('No se pudo quitar la notificación: ' + e.message, 'error');
    }
}

function sharedItemPayload(item) {
    const payload = item && item.payload ? item.payload : {};
    return typeof payload === 'string' ? (function() { try { return JSON.parse(payload) } catch (e) { return {} } })() : payload;
}

async function openSharedItemPreview(id) {
    closeNotificationsPanel();
    const item = await getSharedItemById(id);
    if (!item) { showNotification('Este compartido ya no está disponible.', 'error'); return; }
    if (sharedItemLifecycle(item, Date.now()) !== SHARED_LIFECYCLE_ACTIVE) { showNotification('Este compartido ya venció.', 'error'); return; }
    await markSharedItemViewed(id);
    if (item.item_type === 'song') {
        const { data, error } = await supabaseClient.from('songs').select('*').eq('id', item.item_id).maybeSingle();
        if (error || !data) { showNotification('La canción compartida ya no está disponible.', 'error'); return; }
        cloudSongPreviewCache[item.item_id] = canonicalSongToLocal(data, 'shared');
        showCloudSongPreviewModal(item.item_id, item.id);
        return;
    }
    if (item.item_type === 'list') {
        await showSharedListPreview(item);
    }
}

async function showSharedListPreview(item) {
    const payload = sharedItemPayload(item);
    const ids = [...new Set((payload.songIds || []).filter(Boolean))];
    let rows = [];
    if (ids.length > 0) {
        const result = await supabaseClient.from('songs').select('id,title,artist,original_key').in('id', ids);
        rows = result.data || [];
    }
    const byId = {};
    rows.forEach(row => { byId[row.id] = row; });
    const songsHtml = ids.length === 0
        ? '<div style="font-size:.78rem;color:#71717a;padding:12px 0">Esta lista no tiene canciones todavía.</div>'
        : '<div style="display:flex;flex-direction:column;gap:6px;margin:12px 0">' + ids.map(songId => {
            const row = byId[songId];
            return '<div style="padding:9px 10px;border-radius:8px;background:rgba(39,39,42,.55);font-size:.78rem;color:' + (row ? '#e4e4e7' : '#fbbf24') + '">'
                + (row ? '🎵 ' + esc(row.title || 'Sin título') + ' <span style="color:#71717a">— ' + esc(row.artist || 'Desconocido') + '</span>' : '⚠ Canción no disponible en el catálogo: ' + esc(songId))
                + '</div>';
        }).join('') + '</div>';
    const safeId = String(item.id).replace(/'/g, "\\'");
    const modal = document.createElement('div');
    modal.id = 'shared-list-preview-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:flex-end;justify-content:center;padding:12px';
    modal.innerHTML = '<div style="background:#18181b;border:1px solid rgba(63,63,70,.7);border-radius:16px;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:18px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div style="font-size:1.05rem;font-weight:700;color:#fff">' + esc(payload.name || item.title || 'Lista compartida') + '</div><div style="font-size:.76rem;color:#a1a1aa">Compartida por ' + esc(item.sender_name || item.sender_id || 'Usuario') + '</div></div><button class="btn-icon" onclick="document.getElementById(\'shared-list-preview-modal\').remove()" style="color:#a1a1aa">×</button></div>'
        + (payload.description ? '<div style="font-size:.78rem;color:#a1a1aa;margin-top:10px">' + esc(payload.description) + '</div>' : '')
        + '<div style="font-size:.7rem;color:#71717a;margin-top:12px">Vista previa · ' + ids.length + ' canciones. Guardar la lista no añade automáticamente las canciones a tu biblioteca.</div>'
        + songsHtml
        + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn btn-zinc" onclick="document.getElementById(\'shared-list-preview-modal\').remove()">Cerrar</button><button class="btn btn-amber" onclick="acceptSharedListItem(\'' + safeId + '\')">Guardar lista</button></div>'
        + '</div>';
    document.body.appendChild(modal);
}

async function acceptSharedListItem(id) {
    const item = await getSharedItemById(id);
    if (!item) { showNotification('Este compartido ya no está disponible.', 'error'); return; }
    const payload = sharedItemPayload(item);
    const ids = [...new Set((payload.songIds || []).filter(Boolean))];
    const pendingOnly = ids.some(songId => !songs.some(song => (song.sourceId || song.id) === songId));
    const created = createOrMergeList({ name: payload.name || item.title || 'Lista compartida', description: payload.description || '' }, ids.map(songId => ({ id: songId })), pendingOnly);
    if (created === false) return;
    await markSharedItemAccepted(id);
    const modal = document.getElementById('shared-list-preview-modal');
    if (modal) modal.remove();
    renderLists();
    showNotification('Lista guardada en Listas. Puedes elegir qué canciones añadir a tu biblioteca.', 'success');
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
    if (blockIfOffline()) return;
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
            const sharedItems = await loadSharedItems(false);
            const lastSeen = parseInt(localStorage.getItem(NOTIF_LAST_SEEN_KEY) || '0', 10);
            if (notifs.some(n => (n.created_at || 0) > lastSeen) || sharedItems.some(n => n.status === 'pending' && (n.created_at || 0) > lastSeen)) hasNotif = true;
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
    const proposeBtnWrap = document.getElementById('propose-activity-btn-wrap');
    if (proposeBtnWrap) proposeBtnWrap.style.display = (currentUser && isOnline) ? '' : 'none';

    const birthdays = await getBirthdayVirtualNotifications();
    const welcome = getLocalWelcomeNotification();
    const dbNotifs = await loadNotifications(true);
    const sharedItems = await loadSharedItems(true);
    const sharedDisplay = sharedItems.map(item => ({
        id: 'shared-' + item.id,
        _sharedItemId: item.id,
        titulo: item.item_type === 'song' ? '🎵 Canción compartida' : '📋 Lista compartida',
        cuerpo: (item.sender_name || item.sender_id || 'Un usuario') + ' te compartió "' + (item.title || (item.item_type === 'song' ? 'una canción' : 'una lista')) + '"',
        created_by: item.sender_name || item.sender_id || '',
        created_at: item.created_at,
        tipo: 'shared_item'
    }));
    const all = [...(welcome ? [welcome] : []), ...birthdays, ...dbNotifs, ...sharedDisplay].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    const reactionsByNotif = await loadReactionsForNotifs(dbNotifs.map(n => n.id));

    if (all.length === 0) {
        list.innerHTML = '<div class="admin-empty">No hay notificaciones por ahora 🔔</div>';
    } else {
        list.innerHTML = all.map(n => {
            const when = n.created_at ? new Date(n.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            const isShared = n.tipo === 'shared_item';
            const isSystem = n.tipo === 'sistema' || n.tipo === 'cumpleanos' || n.tipo === 'bienvenida' || isShared;
            const canReact = !!currentUser && !isShared && n.tipo !== 'cumpleanos' && n.tipo !== 'bienvenida';
            const rx = reactionsByNotif[n.id] || { like: [], heart: [] };
            const iReactedLike = currentUser && rx.like.includes(currentUser.id);
            const iReactedHeart = currentUser && rx.heart.includes(currentUser.id);
            const reactionsHtml = canReact
                ? '<div class="notif-item-reactions">'
                    + '<button class="notif-reaction-btn' + (iReactedLike ? ' active' : '') + '" onclick="event.stopPropagation();toggleNotificationReaction(\'' + n.id + '\',\'like\')">👍🏽 ' + (rx.like.length || '') + '</button>'
                    + '<button class="notif-reaction-btn' + (iReactedHeart ? ' active' : '') + '" onclick="event.stopPropagation();toggleNotificationReaction(\'' + n.id + '\',\'heart\')">❤️ ' + (rx.heart.length || '') + '</button>'
                    + '</div>'
                : '';
            const isVirtual = n.tipo === 'cumpleanos' || n.tipo === 'bienvenida' || isShared;
            const isRealDbNotif = !isVirtual;
            const canClickToSeeReactions = isRealDbNotif && canSendNotifications();
            const titleEsc = esc(n.titulo).replace(/'/g, "\\'");
            const sharedAction = isShared
                ? '<div style="display:flex;align-items:center;gap:12px;margin-top:10px"><button class="btn btn-amber" style="padding:6px 12px;font-size:.72rem" onclick="event.stopPropagation();openSharedItemPreview(\'' + String(n._sharedItemId).replace(/'/g, "\\'") + '\')">Ver</button><button class="btn btn-zinc" style="padding:6px 12px;font-size:.72rem;color:#fca5a5;border-color:rgba(248,113,113,.35)" onclick="event.stopPropagation();dismissSharedItem(\'' + String(n._sharedItemId).replace(/'/g, "\\'") + '\')">Eliminar</button></div>'
                : '';
            return '<div class="notif-item' + (isSystem ? ' notif-item-system' : '') + (canClickToSeeReactions ? ' notif-item-clickable' : '') + '"' + (canClickToSeeReactions ? ' onclick="showNotificationReactionsModal(\'' + n.id + '\',\'' + titleEsc + '\')"' : '') + '>'
                + '<div class="notif-item-title">' + esc(n.titulo) + '</div>'
                + (n.cuerpo ? '<div class="notif-item-body">' + esc(n.cuerpo) + '</div>' : '')
                + '<div class="notif-item-meta">' + (n.created_by ? esc(n.created_by) + ' · ' : '') + when + '</div>'
                + sharedAction
                + reactionsHtml
                + '</div>';
        }).join('');
    }

    markNotificationsSeen(dbNotifs.concat(birthdays, sharedItems));
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
    if (blockIfOffline()) return;
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
async function notifyNewRepertorio(titulo) {    if (!supabaseReady || !isOnline) return;
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
    if (blockIfOffline()) return;
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
    if (blockIfOffline()) return;
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
if (typeof submitCreateRepertorio === 'function') {
    const _notifOriginalCreateRepertorio = submitCreateRepertorio;
    submitCreateRepertorio = async function() {
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
