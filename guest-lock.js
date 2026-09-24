// ============= MÓDULO BLOQUEO DE INVITADOS — archivo aparte, no toca app.js/admin.js/social.js/help.js/notifications.js =============
// Si alguien usa la app sin cuenta por más de GUEST_LOCK_DAYS días (contados en este
// dispositivo con localStorage), se le bloquea toda la app con una pantalla que solo
// deja Iniciar sesión o Crear cuenta.

const GUEST_FIRST_SEEN_KEY = 'cb_guest_first_seen';
const GUEST_LOCK_DAYS = 5;

function daysSinceGuestFirstSeen() {
    const stored = localStorage.getItem(GUEST_FIRST_SEEN_KEY);
    if (!stored) return 0;
    const ms = Date.now() - parseInt(stored, 10);
    return ms / (1000 * 60 * 60 * 24);
}

function isGuestLocked() {
    if (currentUser) return false;
    if (!localStorage.getItem(GUEST_FIRST_SEEN_KEY)) {
        // Primera vez que se ve este dispositivo sin cuenta: solo empezamos a contar.
        localStorage.setItem(GUEST_FIRST_SEEN_KEY, String(Date.now()));
        return false;
    }
    return daysSinceGuestFirstSeen() >= GUEST_LOCK_DAYS;
}

// El botón "Usar sin sesión (solo local)" no debe funcionar como escape mientras
// el bloqueo esté activo, o dejaría de ser obligatorio.
function hideGuestModalSkipButton() {
    const btn = document.querySelector('#auth-login-form button[onclick="closeAuthModal()"]');
    if (btn) btn.style.display = 'none';
}
function restoreGuestModalSkipButton() {
    const btn = document.querySelector('#auth-login-form button[onclick="closeAuthModal()"]');
    if (btn) btn.style.display = '';
}

function showGuestLockScreen() {
    hideGuestModalSkipButton();
    if (document.getElementById('guest-lock-screen')) return;
    const overlay = document.createElement('div');
    overlay.id = 'guest-lock-screen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:#09090b;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center';
    overlay.innerHTML =
        '<div style="max-width:340px">'
        + '<div style="width:56px;height:56px;background:#f59e0b;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">'
        + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
        + '</div>'
        + '<div style="font-size:1.05rem;font-weight:700;color:#fff;margin-bottom:8px">Necesitas una cuenta para continuar</div>'
        + '<div style="font-size:.82rem;color:#a1a1aa;margin-bottom:22px;line-height:1.5">Ya llevas unos días usando la app sin registrarte. Crea una cuenta gratis (o inicia sesión si ya tienes una) para seguir viendo los repertorios.</div>'
        + '<button class="btn btn-amber w-full" style="justify-content:center;margin-bottom:8px;padding:10px" onclick="showAuthModal(\'register\')">Crear cuenta</button>'
        + '<button class="btn btn-zinc w-full" style="justify-content:center;padding:10px" onclick="showAuthModal(\'login\')">Ya tengo cuenta</button>'
        + '</div>';
    document.body.appendChild(overlay);
}

function hideGuestLockScreen() {
    const overlay = document.getElementById('guest-lock-screen');
    if (overlay) overlay.remove();
    restoreGuestModalSkipButton();
}

function checkGuestLock() {
    if (isGuestLocked()) showGuestLockScreen();
    else hideGuestLockScreen();
}

// ============= REGISTRO DE INVITADOS (panel Admin > Invitados) =============
// Identificador anónimo por navegador/dispositivo — NO es una cuenta, es solo
// "alguien está usando la app sin cuenta desde este navegador". Se guarda en
// guest_sessions (tabla aparte, nunca se mezcla con los perfiles).
const GUEST_UUID_KEY = 'cb_guest_uuid';
const GUEST_LAST_SYNC_KEY = 'cb_guest_last_sync';

function getOrCreateGuestUuid() {
    let id = localStorage.getItem(GUEST_UUID_KEY);
    // guest_sessions.id es UUID. Regeneramos identificadores antiguos de
    // fallback (por ejemplo "g...") para que la RPC pueda validarlos.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!id || !uuidPattern.test(id)) {
        if (window.crypto && crypto.randomUUID) {
            id = crypto.randomUUID();
        } else {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem(GUEST_UUID_KEY, id);
    }
    return id;
}

async function upsertGuestSession() {
    if (currentUser || !supabaseReady || !supabaseClient) return;
    if (typeof isOnline !== 'undefined' && !isOnline) return;
    // Throttle de 5 min, mismo patrón que updateLastAccess() para usuarios con cuenta.
    const lastSync = localStorage.getItem(GUEST_LAST_SYNC_KEY);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync, 10)) < 300000) return;
    const id = getOrCreateGuestUuid();
    try {
        // El invitado no tiene permisos directos sobre la tabla. La RPC
        // SECURITY DEFINER registra el alta o actualiza solo last_seen en el
        // servidor, sin exponer INSERT/UPDATE generales al rol anon.
        const { error: recordError } = await supabaseClient.rpc('record_guest_session', { p_id: id });
        if (recordError) {
            console.warn('[Guest] No se pudo registrar la sesión:', recordError.message);
            return;
        }
        localStorage.setItem(GUEST_LAST_SYNC_KEY, String(now));
    } catch (e) {
        console.warn('[Guest] Error registrando actividad:', e.message);
    }
}

// La presencia de invitados comparte el canal de usuarios. app.js etiqueta
// cada entrada como user/guest y filtra los contadores; así un invitado puede
// ver cuántas cuentas registradas están en línea y Admin puede ver invitados.
let guestOnlineIds = new Set();
function setupGuestPresenceChannel() {
    if (currentUser || !supabaseReady || !supabaseClient) return;
    if (typeof setupPresenceChannel === 'function') setupPresenceChannel();
}

// Cuando ese mismo navegador termina logueándose (registro nuevo o cuenta
// existente), se marca su fila de guest_sessions como "convertida" — no se
// borra sola, el Admin decide cuándo borrarla desde el panel.
let _guestConversionChecked = false;
async function checkGuestConversion() {
    if (_guestConversionChecked || !currentUser || !supabaseReady || !supabaseClient) return;
    const id = localStorage.getItem(GUEST_UUID_KEY);
    if (!id) { _guestConversionChecked = true; return; }
    _guestConversionChecked = true;
    const nombre = currentUser.nombre ? (currentUser.nombre + ' ' + (currentUser.apellido || '')).trim() : (currentUser.id || '');
    try {
        const { error } = await supabaseClient
            .from('guest_sessions')
            .update({ registered_user_id: currentUser.id, registered_name: nombre, registered_at: Date.now() })
            .eq('id', id);
        if (error) console.warn('[Guest] No se pudo marcar la conversión:', error.message);
    } catch (e) { console.warn('[Guest] Error marcando conversión:', e.message); }
}

// ---------- Enganches sin tocar los demás archivos ----------
if (typeof updateUserUI === 'function') {
    const _guestLockOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _guestLockOriginalUpdateUserUI();
        checkGuestLock();
        if (!currentUser) { upsertGuestSession(); setupGuestPresenceChannel() }
        else { checkGuestConversion() }
    };
}

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && !currentUser) upsertGuestSession();
});
setInterval(function() { if (!currentUser) upsertGuestSession() }, 300000);

// Revisión al cargar la app (currentUser ya está restaurado por app.js en este punto)
checkGuestLock();
setTimeout(function() {
    if (!currentUser) { upsertGuestSession(); setupGuestPresenceChannel() }
}, 2000);
