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

// ---------- Enganches sin tocar los demás archivos ----------
if (typeof updateUserUI === 'function') {
    const _guestLockOriginalUpdateUserUI = updateUserUI;
    updateUserUI = function() {
        _guestLockOriginalUpdateUserUI();
        checkGuestLock();
    };
}

// Revisión al cargar la app (currentUser ya está restaurado por app.js en este punto)
checkGuestLock();
