
const SUPABASE_URL = 'https://vkafuvslrpwfevkfzxyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrYWZ1dnNscnB3ZmV2a2Z6eHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzkzOTAsImV4cCI6MjEwMjQxNTM5MH0.jTKSLHb5RaYbXlBEQgWpEntfzzvIBI6esSdNzm58nek';
const R2_WORKER_URL = 'https://repertorios-r2-api.kevinf652.workers.dev';
// Helper: Extract a clean R2 key from any URL or path string
// Handles: full URLs, relative paths, paths with /file/ prefix, bare filenames
function extractR2Key(urlOrPath) {
  if (!urlOrPath) return '';
  try {
    let key = urlOrPath;
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      key = new URL(urlOrPath).pathname;
    }
    if (key.startsWith('/')) key = key.substring(1);
    if (key.toLowerCase().startsWith('file/')) key = key.substring(5);
    return key;
  } catch (e) {
    let key = urlOrPath;
    if (key.startsWith('/')) key = key.substring(1);
    if (key.toLowerCase().startsWith('file/')) key = key.substring(5);
    return key;
  }
}
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_MAP = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
  'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11, 'B#': 0
};
const KEY_NAMES=['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'];
const KEY_VALUES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function load(k,d){try{return JSON.parse(localStorage.getItem(k))||d}catch{return d}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function genId(){return Date.now().toString(36)+Math.random().toString(36).substr(2,9)}
let useFlats=load('cb_use_flats',false);
function dn(note){if(!note)return'';const idx=NOTE_MAP[note];if(idx===undefined)return note;return useFlats?FLATS[idx]:SHARPS[idx]}
function nn(n){return NOTE_MAP[n]!==undefined?dn(n):n}
function displayNote(n){return dn(n)}
function displayChord(c){return c.replace(/([A-G][#b]?)/g,(match)=>{const idx=NOTE_MAP[match];if(idx===undefined)return match;return useFlats?FLATS[idx]:SHARPS[idx]})}
function toggleNotation(){useFlats=!useFlats;save('cb_use_flats',useFlats);const btns=document.querySelectorAll('#notation-toggle,#lib-notation-toggle');btns.forEach(b=>b.innerHTML=useFlats?'♭':'#');if(viewingRepId){const r=repertorios.find(x=>x.id===viewingRepId);const s=r?.canciones.find(x=>x.id===viewingRepSongId);if(s){repCurrentKey=dn(s.tono_original)}}if(viewingSongId){const s=songs.find(x=>x.id===viewingSongId);if(s&&NOTE_MAP[s.currentKey]!==undefined){s.currentKey=dn(s.currentKey);save('cb_songs',songs)}}if(viewingRepId)renderRepSongLyrics();if(viewingSongId)renderView();renderLibrary()}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// Parse filename: "Nombre - Artista - Tono - BPM" or simpler formats
function parseSongFilename(name){
  const base=name.replace(/\.[^/.]+$/,'').replace(/[_]/g,' ').trim();
  // Try pattern: Name - Artist - Key - BPM (where Key is like C, Am, G#, etc.)
  const KEY_RE=/^([A-Ga-g][#b]?m?m?[a-z0-9]*)$/;
  const BPM_RE=/^\d{2,3}$/;
  const parts=base.split(/\s*-\s*/).map(s=>s.trim()).filter(Boolean);
  if(parts.length>=4){
    const bpm=parts[parts.length-1];
    const key=parts[parts.length-2];
    if(BPM_RE.test(bpm) && KEY_RE.test(key)){
      return {title:parts.slice(0,parts.length-2).join(' - '),artist:parts[parts.length-3]||'Desconocido',key:key.toUpperCase(),bpm:parseInt(bpm)};
    }
  }
  if(parts.length>=3){
    const key=parts[parts.length-1];
    if(KEY_RE.test(key)){
      return {title:parts.slice(0,parts.length-1).join(' - '),artist:parts[parts.length-2]||'Desconocido',key:key.toUpperCase(),bpm:0};
    }
  }
  if(parts.length>=2){
    return {title:parts[0],artist:parts[1],key:'',bpm:0};
  }
  return {title:base||'Sin título',artist:'Desconocido',key:'',bpm:0};
}

// Parse coros from DB - handles JSON object {d:[],l:[]}, array, comma-separated string, or null
function parseCoros(c,day){
  if(!c)return[];
  if(typeof c==='string'){
    try{c=JSON.parse(c)}catch(e){return c.split(',').map(function(x){return x.trim()}).filter(Boolean)}
  }
  if(typeof c==='object'&&!Array.isArray(c)){
    return c[day==='domingo'?'d':'l']||c.d||c.l||[];
  }
  if(Array.isArray(c))return c;
  return[];
}

let songs=load('cb_songs',[]);
let lists=load('cb_lists',[]);
let repertorios=[];
let repAdmin=false;
let userRole='usuario'; // 'usuario', 'admin', 'D_Musicos', 'D_Voces'
function isAdmin(){return userRole==='admin'}
function isDMusicos(){return userRole==='D_Musicos'}
function isDVoces(){return userRole==='D_Voces'}
function canEditRepSongs(){return isAdmin()||isDMusicos()}
function canEditVocals(){return isAdmin()||isDVoces()}
function canUploadAudio(){return isAdmin()}
function canManageReps(){return isAdmin()}
let viewingRepId=null;
let viewingRepSongId=null;
let repDay='domingo';
let libVocalMode=null; // null, 'domingo', or 'lunes'
let repShowChords=true;
let repCurrentKey='';
let repTab='active';
let repHistoryMonth='';
let repHistoryYear='';
let editingSongId=null;
let viewingSongId=null;
let viewingListId=null;
let viewReturnTo=null;
let formTags=[];
let formKey='C';
let listNavIndex=0;
let repSongNavIndex=0;
let supabaseReady=false;
let supabaseClient=null;

try{
  if(window.supabase&&window.supabase.createClient){
    supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    supabaseReady=true;
    console.log('Supabase connected');
  }
}catch(e){console.error('Supabase init error:',e)}

// ============= SUPABASE REALTIME SUBSCRIPTIONS =============
function setupRealtimeSubscriptions(){
  if(!supabaseReady||!supabaseClient)return;
  console.log('Setting up Supabase Realtime subscriptions...');

  // 1. Subscribe to vocal_notes changes
  supabaseClient.channel('vocal-notes-changes')
    .on('postgres_changes',{event:'*',schema:'public',table:'vocal_notes'},function(payload){
      console.log('Realtime vocal_notes change:',payload.eventType);
      vocalNotesCache={};
      if(viewingSongId)renderView();
      if(viewingRepSongId)renderRepSongLyrics();
    })
    .subscribe();

  // 2. Subscribe to repertorios changes
  supabaseClient.channel('repertorios-changes')
    .on('postgres_changes',{event:'*',schema:'public',table:'repertorios'},function(payload){
      console.log('Realtime repertorios change:',payload.eventType);
      loadRepertorios().then(function(){
        var repPage=document.getElementById('page-repertorios');
        if(repPage&&repPage.classList.contains('active'))renderRepertorios();
        var repViewPage=document.getElementById('page-repertorio');
        if(repViewPage&&repViewPage.classList.contains('active'))renderRepertorioView();
        var repSongPage=document.getElementById('page-rep-song');
        if(repSongPage&&repSongPage.classList.contains('active'))renderRepSongLyrics();
      });
    })
    .subscribe();

  // 3. Subscribe to canciones_repertorio changes (adding/removing songs)
  supabaseClient.channel('canciones-rep-changes')
    .on('postgres_changes',{event:'*',schema:'public',table:'canciones_repertorio'},function(payload){
      console.log('Realtime canciones_repertorio change:',payload.eventType);
      loadRepertorios().then(function(){
        var repPage=document.getElementById('page-repertorios');
        if(repPage&&repPage.classList.contains('active'))renderRepertorios();
        var repViewPage=document.getElementById('page-repertorio');
        if(repViewPage&&repViewPage.classList.contains('active'))renderRepertorioView();
      });
    })
    .subscribe();

  console.log('Realtime subscriptions active');
}

setTimeout(setupRealtimeSubscriptions,2000);

// ============= SONG CREATION/MODIFICATION NOTE =============
function getSongNoteHtml(s){
  if(!s)return'';
  var html='<div style="margin-top:10px;padding:8px 10px;background:rgba(39,39,42,.3);border:1px solid rgba(63,63,70,.3);border-radius:8px;font-size:.7rem;color:#71717a;line-height:1.6">';
  var createdDate=s.createdAt?new Date(s.createdAt).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'}):'';
  var createdBy=s.createdBy||'';
  var modifiedDate=s.updatedAt&&s.updatedAt!==s.createdAt?new Date(s.updatedAt).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'}):'';
  // Support both library fields (modifiedBy/updatedAt) and repertorio DB fields (modificado_por/fecha_modificacion)
  var modifiedBy=s.modifiedBy||s.modificado_por||'';
  if(!modifiedDate&&s.fecha_modificacion){modifiedDate=new Date(s.fecha_modificacion).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'})}
  if(createdDate&&createdBy){html+='<div>📅 Fecha de creación: '+createdDate+' — Creado por: <span style="color:#a1a1aa">'+esc(createdBy)+'</span></div>'}
  else if(createdDate){html+='<div>📅 Fecha de creación: '+createdDate+'</div>'}
  if(modifiedDate&&modifiedBy){html+='<div>✏️ Última modificación: '+modifiedDate+' — Modificado por: <span style="color:#a1a1aa">'+esc(modifiedBy)+'</span></div>'}
  html+='</div>';
  return html;
}

// ============= VOCAL NOTES (INLINE PER SECTION) =============
var vocalNotesCache={};var vocalNotesTimers={};
async function loadSectionNotes(sourceSongId,dia){var cacheKey=sourceSongId+'_'+dia;if(vocalNotesCache[cacheKey]!==undefined)return vocalNotesCache[cacheKey];if(!supabaseReady||!sourceSongId){vocalNotesCache[cacheKey]={};return{}}try{var result=await supabaseClient.from('vocal_notes').select('notas').eq('source_song_id',sourceSongId).eq('dia',dia).maybeSingle();var raw=(result.data&&result.data.notas)?result.data.notas:'';var parsed={};if(raw){try{parsed=JSON.parse(raw)}catch(e){parsed={'_raw':raw}}}vocalNotesCache[cacheKey]=parsed;return parsed}catch(e){console.log('loadSectionNotes error:',e.message);vocalNotesCache[cacheKey]={};return{}}}
async function saveSectionNote(sourceSongId,dia,sectionName,noteText){var cacheKey=sourceSongId+'_'+dia;var notes=await loadSectionNotes(sourceSongId,dia);if(noteText){notes[sectionName]=noteText}else{delete notes[sectionName]}vocalNotesCache[cacheKey]=notes;if(!supabaseReady||!sourceSongId)return;var userName=currentUser?(currentUser.nombre?currentUser.nombre+' '+(currentUser.apellido||''):currentUser.id):'';var notasStr=JSON.stringify(notes);try{var existing=await supabaseClient.from('vocal_notes').select('id').eq('source_song_id',sourceSongId).eq('dia',dia).maybeSingle();if(existing.data&&existing.data.id){await supabaseClient.from('vocal_notes').update({notas:notasStr,updated_at:Date.now()}).eq('id',existing.data.id)}else{await supabaseClient.from('vocal_notes').insert({source_song_id:sourceSongId,dia:dia,notas:notasStr,created_by:userName,created_at:Date.now(),updated_at:Date.now()})}}catch(e){console.error('saveSectionNote error:',e.message)}}
function onSectionNoteInput(sourceSongId,dia,sectionName,input){var cacheKey=sourceSongId+'_'+dia+'_'+sectionName;var notes=vocalNotesCache[sourceSongId+'_'+dia]||{};if(input.value){notes[sectionName]=input.value}else{delete notes[sectionName]}vocalNotesCache[sourceSongId+'_'+dia]=notes;var statusEl=input.parentNode.querySelector('.section-note-status');if(statusEl){statusEl.textContent='Guardando...';statusEl.style.color='#fbbf24'}if(vocalNotesTimers[cacheKey])clearTimeout(vocalNotesTimers[cacheKey]);vocalNotesTimers[cacheKey]=setTimeout(async function(){await saveSectionNote(sourceSongId,dia,sectionName,input.value);if(statusEl){statusEl.textContent='\u2713';statusEl.style.color='#4ade80';setTimeout(function(){statusEl.textContent=''},1500)}},800)}
function toggleVocalNotesLib(sourceSongId,dia,btnEl){if(libVocalMode===dia){libVocalMode=null}else{libVocalMode=dia}vocalNotesCache={};renderView()}
// ============= GLOBAL AUDIO MANAGEMENT =============
function stopAllAudio(){
  // Stop view page audio
  if(viewAudioEl){viewAudioEl.pause();viewAudioEl.currentTime=0;viewAudioEl=null;viewAudioPlaying=false;stopViewAudioProgress()}
  // Stop repertorio song audio
  if(repAudioEl){repAudioEl.pause();repAudioEl.currentTime=0;repAudioEl=null;repAudioPlaying=false;stopAudioProgress()}
  // Stop all vocal audio players
  Object.keys(vocalAudioPlayers).forEach(function(k){try{vocalAudioPlayers[k].pause();vocalAudioPlayers[k].currentTime=0}catch(e){}});
  vocalAudioPlayers={};vocalAudioCurrentKey=null;stopVocalAudioProgress();
  // Update buttons
  updateViewAudioBtn();updateAudioBtn();updateVocalAudioButtons();
}

// Update all vocal audio play/pause button icons
function updateVocalAudioButtons(){
  document.querySelectorAll('[data-vocal-key]').forEach(function(btn){
    var key=btn.getAttribute('data-vocal-key');
    if(vocalAudioCurrentKey===key){
      btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      btn.style.color='#f59e0b';
    }else{
      btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
      btn.style.color='#4ade80';
    }
  });
  // Update global vocal audio player bar
  updateVocalAudioPlayerBar();
}

// ============= VOCAL AUDIO PLAYER BAR =============
let vocalAudioInterval=null;
function startVocalAudioProgress(){
  stopVocalAudioProgress();
  vocalAudioInterval=setInterval(function(){
    var audio=vocalAudioPlayers[vocalAudioCurrentKey];
    if(!audio)return;
    var pct=audio.duration?(audio.currentTime/audio.duration)*100:0;
    var fill=document.getElementById('vocal-audio-fill');
    if(fill)fill.style.width=pct+'%';
    var cur=document.getElementById('vocal-audio-current');
    if(cur)cur.textContent=formatTime(audio.currentTime);
    var dur=document.getElementById('vocal-audio-duration');
    if(dur)dur.textContent=audio.duration?formatTime(audio.duration):'--:--';
  },250);
}
function stopVocalAudioProgress(){
  if(vocalAudioInterval){clearInterval(vocalAudioInterval);vocalAudioInterval=null}
}
function seekVocalAudio(e){
  var audio=vocalAudioPlayers[vocalAudioCurrentKey];
  if(!audio||!audio.duration)return;
  var bar=e.currentTarget;
  var rect=bar.getBoundingClientRect();
  var pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  audio.currentTime=pct*audio.duration;
}
function seekVocalAudioTouch(e){
  var audio=vocalAudioPlayers[vocalAudioCurrentKey];
  if(!audio||!audio.duration)return;
  var bar=e.currentTarget;
  var rect=bar.getBoundingClientRect();
  var touch=e.touches[0];
  var pct=Math.max(0,Math.min(1,(touch.clientX-rect.left)/rect.width));
  audio.currentTime=pct*audio.duration;
}
function updateVocalAudioPlayerBar(){
  var bar=document.getElementById('vocal-audio-player-bar');
  if(!bar)return;
  if(vocalAudioCurrentKey&&vocalAudioPlayers[vocalAudioCurrentKey]){
    bar.style.display='flex';
    startVocalAudioProgress();
  }else{
    bar.style.display='none';
    stopVocalAudioProgress();
  }
}
function toggleVocalAudioFromBar(){
  var audio=vocalAudioPlayers[vocalAudioCurrentKey];
  if(!audio)return;
  if(!audio.paused){audio.pause();updateVocalAudioButtons()}
  else{audio.play().catch(function(e){console.error(e)});updateVocalAudioButtons()}
}

// ============= URL NORMALIZATION =============
// Fixes double path issues in vocal audio URLs
function normalizeVocalAudioUrl(url){
  if(!url)return url;
  const supabasePattern=/^(https?:\/\/[^\/]+\/storage\/v1\/object\/public\/)([^\/]+)\/(.+)$/;
  const match=url.match(supabasePattern);
  if(match){
    const base=match[1],bucket=match[2],path=match[3];
    if(path.startsWith(bucket+'/')){
      return base+bucket+'/'+path.substring(bucket.length+1);
    }
    return url;
  }
  return url;
}

// ============= AUTH SYSTEM =============
let currentUser = null;

function initAuth() {
  const saved = localStorage.getItem('rl_current_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      // Restore role from saved user
      userRole = currentUser.role || 'usuario';
      repAdmin = (userRole === 'admin');
      // If logged in as admin, enable admin mode for repertorios
      if (currentUser && currentUser.id === 'admin') {
        repAdmin = true;
      }
      // Try to load songs from cloud on init
      if (currentUser && supabaseReady) {
        console.log('User logged in, loading songs from cloud...');
        loadSongsFromCloud().then(cloudSongs => {
          if (cloudSongs && cloudSongs.length > 0) {
            songs = cloudSongs;
            renderLibrary();
            console.log('Loaded', cloudSongs.length, 'songs from cloud on init');
          }
        });
      }
    } catch(e) {
      currentUser = null;
    }
  }
  // Always update UI (for both logged in and guest modes)
  updateUserUI();
}

function updateUserUI() {
  const avatar = document.getElementById('user-avatar-btn');
  const nameBtn = document.getElementById('user-name-btn');
  const dropdownContent = document.getElementById('user-dropdown-content');
  
  if (currentUser) {
    const displayName = currentUser.nombre ? currentUser.nombre + ' ' + (currentUser.apellido || '') : currentUser.id;
    const initials = currentUser.nombre ? currentUser.nombre[0] + (currentUser.apellido ? currentUser.apellido[0] : '') : currentUser.id.substring(0, 2);
    avatar.textContent = initials.toUpperCase();
    nameBtn.textContent = currentUser.id;
    
    dropdownContent.innerHTML = `
      <div style="padding:8px 12px;border-bottom:1px solid rgba(63,63,70,.5);margin-bottom:4px">
        <div style="font-size:.8rem;font-weight:600;color:#fff">${esc(displayName.trim())}</div>
        <div style="font-size:.7rem;color:#71717a">@${esc(currentUser.id)}</div>
      </div>
      <button class="user-dropdown-item" onclick="showChangePasswordModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Cambiar contraseña
      </button>
      <div class="user-dropdown-divider"></div>
      <button class="user-dropdown-item" onclick="handleLogout()" style="color:#f87171">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Cerrar sesión
      </button>
    `;
  } else {
    avatar.textContent = '?';
    nameBtn.textContent = 'Invitado';
    
    dropdownContent.innerHTML = `
      <div style="padding:8px 12px;border-bottom:1px solid rgba(63,63,70,.5);margin-bottom:4px">
        <div style="font-size:.8rem;color:#a1a1aa">Modo local</div>
        <div style="font-size:.7rem;color:#71717a">Tus datos no se sincronizan</div>
      </div>
      <button class="user-dropdown-item" onclick="showAuthModal('login')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10,17 15,12 10,7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        Iniciar sesión
      </button>
      <button class="user-dropdown-item" onclick="showAuthModal('register')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        Crear cuenta
      </button>
    `;
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.querySelector('.user-menu');
  const dropdown = document.getElementById('user-dropdown');
  if (menu && !menu.contains(e.target)) {
    dropdown.classList.remove('active');
  }
});

function showAuthModal(tab) {
  document.getElementById('auth-modal').classList.add('active');
  switchAuthTab(tab || 'login');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-success').classList.remove('show');
}

function switchAuthTab(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  if (tab === 'login') {
    tabs[0].classList.add('active');
    document.getElementById('auth-login-form').style.display = 'block';
    document.getElementById('auth-register-form').style.display = 'none';
  } else {
    tabs[1].classList.add('active');
    document.getElementById('auth-login-form').style.display = 'none';
    document.getElementById('auth-register-form').style.display = 'block';
  }
  
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-success').classList.remove('show');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('show');
  document.getElementById('auth-success').classList.remove('show');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.classList.add('show');
  document.getElementById('auth-error').classList.remove('show');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) {
    showAuthError('Por favor completa todos los campos');
    return;
  }
  
  if (!supabaseReady) {
    showAuthError('Sin conexión a internet. No se puede iniciar sesión.');
    return;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('*')
      .eq('id', username.toLowerCase())
      .eq('password_hash', password)
      .single();
    
    if (error || !data) {
      showAuthError('Usuario o contraseña incorrectos');
      return;
    }
    
    // Update last login
    await supabaseClient
      .from('admin_users')
      .update({ created_at: Date.now() })
      .eq('id', data.id);
    
    currentUser = { 
      id: data.id, 
      nombre: data.nombre || '', 
      apellido: data.apellido || '',
      role: data.role || 'usuario'
    };
    localStorage.setItem('rl_current_user', JSON.stringify(currentUser));
    
    // Set role-based permissions
    userRole = currentUser.role;
    repAdmin = (userRole === 'admin');
    if (userRole === 'admin') {
      localStorage.setItem('cb_rep_admin', 'true');
    }
    
    updateUserUI();
    closeAuthModal();
    showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '!', 'success');
    
  } catch(e) {
    showAuthError('Error al conectar: ' + e.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const nombre = document.getElementById('reg-nombre').value.trim();
  const apellido = document.getElementById('reg-apellido').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm').value;
  
  if (!nombre || !apellido || !username || !password) {
    showAuthError('Por favor completa todos los campos');
    return;
  }
  
  if (username.toLowerCase() === 'admin') {
    showAuthError('Este usuario está reservado');
    return;
  }
  
  if (password !== passwordConfirm) {
    showAuthError('Las contraseñas no coinciden');
    return;
  }
  
  if (password.length < 4) {
    showAuthError('La contraseña debe tener al menos 4 caracteres');
    return;
  }
  
  if (!supabaseReady) {
    showAuthError('Sin conexión a internet. No se puede registrar.');
    return;
  }
  
  try {
    // Check if username exists
    const { data: existing } = await supabaseClient
      .from('admin_users')
      .select('id')
      .eq('id', username.toLowerCase())
      .single();
    
    if (existing) {
      showAuthError('Este usuario ya está registrado');
      return;
    }
    
    // Create user
    const { error } = await supabaseClient
      .from('admin_users')
      .insert({
        id: username.toLowerCase(),
        nombre: nombre,
        apellido: apellido,
        password_hash: password,
        created_at: Date.now()
      });
    
    if (error) throw error;
    
    showAuthSuccess('¡Cuenta creada! Ahora puedes iniciar sesión.');
    switchAuthTab('login');
    document.getElementById('login-username').value = username.toLowerCase();
    document.getElementById('login-password').value = password;
    
  } catch(e) {
    showAuthError('Error al registrar: ' + e.message);
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('rl_current_user');
  // Reset admin mode and role when logging out
  repAdmin = false;
  userRole = 'usuario';
  localStorage.removeItem('cb_rep_admin');
  updateUserUI();
  document.getElementById('user-dropdown').classList.remove('active');
  showNotification('Sesión cerrada', 'success');
}

function showChangePasswordModal() {
  document.getElementById('user-dropdown').classList.remove('active');
  document.getElementById('change-password-modal').classList.add('active');
  document.getElementById('cp-error').classList.remove('show');
  document.getElementById('cp-success').classList.remove('show');
  document.getElementById('cp-old-password').value = '';
  document.getElementById('cp-new-password').value = '';
  document.getElementById('cp-new-password-confirm').value = '';
}

function closeChangePasswordModal() {
  document.getElementById('change-password-modal').classList.remove('active');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const oldPass = document.getElementById('cp-old-password').value;
  const newPass = document.getElementById('cp-new-password').value;
  const newPassConfirm = document.getElementById('cp-new-password-confirm').value;
  
  if (!oldPass || !newPass || !newPassConfirm) {
    document.getElementById('cp-error').textContent = 'Completa todos los campos';
    document.getElementById('cp-error').classList.add('show');
    return;
  }
  
  if (newPass !== newPassConfirm) {
    document.getElementById('cp-error').textContent = 'Las contraseñas nuevas no coinciden';
    document.getElementById('cp-error').classList.add('show');
    return;
  }
  
  if (newPass.length < 4) {
    document.getElementById('cp-error').textContent = 'La contraseña debe tener al menos 4 caracteres';
    document.getElementById('cp-error').classList.add('show');
    return;
  }
  
  if (!supabaseReady || !currentUser) {
    document.getElementById('cp-error').textContent = 'Error de conexión';
    document.getElementById('cp-error').classList.add('show');
    return;
  }
  
  try {
    // Verify old password
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('id')
      .eq('id', currentUser.id)
      .eq('password_hash', oldPass)
      .single();
    
    if (error || !data) {
      document.getElementById('cp-error').textContent = 'La contraseña actual es incorrecta';
      document.getElementById('cp-error').classList.add('show');
      return;
    }
    
    // Update password
    const { error: updateError } = await supabaseClient
      .from('admin_users')
      .update({ password_hash: newPass })
      .eq('id', currentUser.id);
    
    if (updateError) throw updateError;
    
    document.getElementById('cp-success').textContent = '¡Contraseña actualizada!';
    document.getElementById('cp-success').classList.add('show');
    document.getElementById('cp-error').classList.remove('show');
    
    setTimeout(() => {
      closeChangePasswordModal();
    }, 1500);
    
  } catch(e) {
    document.getElementById('cp-error').textContent = 'Error: ' + e.message;
    document.getElementById('cp-error').classList.add('show');
  }
}

// Initialize auth on load
initAuth();

// ============= CLOUD SYNC FOR SONGS =============
let syncInProgress = false;
let pendingSync = false;

// Sync songs to Supabase when logged in
async function syncSongsToCloud() {
  if (!currentUser || !supabaseReady) {
    console.log('Sync skipped: no user or no supabase');
    return;
  }
  
  if (syncInProgress) {
    console.log('Sync already in progress');
    pendingSync = true;
    return;
  }
  
  syncInProgress = true;
  updateSyncStatus('syncing');
  
  try {
    // Get current songs from localStorage
    const localSongs = load('cb_songs', []);
    console.log('Syncing', localSongs.length, 'songs to cloud');
    
    // First, try to delete existing songs for this user
    try {
      const { error: deleteError } = await supabaseClient
        .from('user_songs')
        .delete()
        .eq('user_id', currentUser.id);
      
      if (deleteError) {
        console.error('Delete error:', deleteError);
        // If table doesn't exist, log it but continue
        if (deleteError.message && deleteError.message.includes('does not exist')) {
          console.log('Table user_songs does not exist. Please create it in Supabase.');
          syncInProgress = false;
          updateSyncStatus('error');
          return;
        }
        // Check for RLS errors
        if (deleteError.code === '42501' || (deleteError.message && deleteError.message.includes('row-level security'))) {
          console.error('⚠️ RLS bloquea DELETE en user_songs. SQL: ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;');
          syncInProgress = false;
          updateSyncStatus('error');
          return;
        }
      } else {
        console.log('Deleted existing songs for user:', currentUser.id);
      }
    } catch (delErr) {
      console.log('Delete catch:', delErr);
    }
    
    // Insert all songs
    if (localSongs.length > 0) {
      const songsToInsert = localSongs.map(song => {
        // Normalize audio_url before storing to avoid stale/old storage URLs
        const songCopy = {...song};
        if(songCopy.audio_url) {
          songCopy.audio_url = normalizeVocalAudioUrl(songCopy.audio_url);
        }
        return {
          user_id: currentUser.id,
          song_data: songCopy,
          created_at: song.createdAt || Date.now(),
          updated_at: song.updatedAt || Date.now()
        };
      });
      
      // Insert in batches of 50 (Supabase limit)
      for (let i = 0; i < songsToInsert.length; i += 50) {
        const batch = songsToInsert.slice(i, i + 50);
        const { data, error } = await supabaseClient
          .from('user_songs')
          .insert(batch);
        
        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        console.log('Inserted batch:', batch.length, 'songs');
      }
    }
    
    syncInProgress = false;
    pendingSync = false;
    updateSyncStatus('synced');
    console.log('Songs synced to cloud successfully');
    
  } catch (e) {
    console.error('Error syncing to cloud:', e);
    syncInProgress = false;
    pendingSync = true;
    updateSyncStatus('error');
    
    // Si el error es por RLS, mostrar mensaje específico
    if (e.code === '42501' || (e.message && e.message.includes('row-level security'))) {
      console.error('⚠️ Error de RLS en user_songs. Ejecuta en Supabase SQL Editor: ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;');
    }
  }
}

// Load songs from Supabase when logged in
async function loadSongsFromCloud() {
  if (!currentUser || !supabaseReady) {
    console.log('Load from cloud skipped: no user or no supabase. currentUser:', !!currentUser, 'supabaseReady:', supabaseReady);
    return null;
  }
  
  updateSyncStatus('loading');
  
  try {
    console.log('Loading songs from cloud for user:', currentUser.id);
    
    const { data, error } = await supabaseClient
      .from('user_songs')
      .select('song_data')
      .eq('user_id', currentUser.id)
      .limit(10000);
    
    if (error) {
      console.error('Load error:', error);
      // Check for RLS errors specifically
      if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
        console.error('⚠️ RLS bloquea la lectura de user_songs. Ejecuta en Supabase SQL Editor:');
        console.error('ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;');
        updateSyncStatus('error');
        return null;
      }
      if (error.message && error.message.includes('does not exist')) {
        console.log('Table user_songs does not exist');
        updateSyncStatus('error');
        return null;
      }
      throw error;
    }
    
    console.log('Cloud response:', data);
    
    if (data && data.length > 0) {
      // CRITICAL: song_data is stored as JSON STRING, must parse it
      const cloudSongs = data.map(d => {
        try {
          const parsed = typeof d.song_data === 'string' ? JSON.parse(d.song_data) : d.song_data;
          // Normalize audio_url to fix any double path issues
          if(parsed && parsed.audio_url) {
            parsed.audio_url = normalizeVocalAudioUrl(parsed.audio_url);
          }
          return parsed;
        } catch(e) {
          console.error('Error parsing song_data:', e, 'raw:', d.song_data);
          return null;
        }
      }).filter(s => s !== null);
      
      console.log('Loaded', cloudSongs.length, 'songs from cloud');
      console.log('Sample song audio_url:', cloudSongs[0]?.audio_url);
      
      // Update localStorage with cloud data (parsed objects)
      save('cb_songs', cloudSongs);
      updateSyncStatus('synced');
      return cloudSongs;
    } else {
      console.log('No songs found in cloud for user:', currentUser.id);
      updateSyncStatus('synced');
      return null;
    }
    
  } catch (e) {
    console.error('Error loading from cloud:', e);
    updateSyncStatus('error');
    return null;
  }
}

// Update sync status indicator
function updateSyncStatus(status) {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  
  switch (status) {
    case 'syncing':
      indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
      indicator.title = 'Sincronizando...';
      break;
    case 'loading':
      indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" class="spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>';
      indicator.title = 'Cargando desde la nube...';
      break;
    case 'synced':
      indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>';
      indicator.title = 'Sincronizado con la nube';
      break;
    case 'error':
      indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      indicator.title = 'Error de sincronización';
      break;
    case 'offline':
      indicator.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>';
      indicator.title = 'Sin conexión - modo local';
      break;
    default:
      indicator.innerHTML = '';
  }
}

// Login with cloud sync
async function handleLoginWithSync(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) {
    showAuthError('Por favor completa todos los campos');
    return;
  }
  
  if (!supabaseReady) {
    showAuthError('Sin conexión a internet. No se puede iniciar sesión.');
    return;
  }
  
  try {
    console.log('Attempting login for:', username);
    
    const { data, error } = await supabaseClient
      .from('admin_users')
      .select('*')
      .eq('id', username.toLowerCase())
      .eq('password_hash', password)
      .single();
    
    if (error || !data) {
      console.error('Login error:', error);
      showAuthError('Usuario o contraseña incorrectos');
      return;
    }
    
    console.log('Login successful for:', data.id);
    
    // Update last login
    await supabaseClient
      .from('admin_users')
      .update({ created_at: Date.now() })
      .eq('id', data.id);
    
    currentUser = { 
      id: data.id, 
      nombre: data.nombre || '', 
      apellido: data.apellido || '',
      role: data.role || 'usuario'
    };
    localStorage.setItem('rl_current_user', JSON.stringify(currentUser));
    
    // Set role-based permissions
    userRole = currentUser.role;
    repAdmin = (userRole === 'admin');
    if (userRole === 'admin') {
      localStorage.setItem('cb_rep_admin', 'true');
    }
    
    updateUserUI();
    closeAuthModal();
    
    // Load songs from cloud
    console.log('Loading songs from cloud...');
    const cloudSongs = await loadSongsFromCloud();
    
    if (cloudSongs && cloudSongs.length > 0) {
      console.log('Cloud songs loaded:', cloudSongs.length);
      songs = cloudSongs;
      renderLibrary();
      showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! ' + cloudSongs.length + ' canciones sincronizadas.', 'success');
    } else {
      console.log('No cloud songs found. Local songs:', songs.length);
      // No cloud songs, sync local songs to cloud
      if (songs.length > 0) {
        await syncSongsToCloud();
        showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! ' + songs.length + ' canciones subidas al servidor.', 'success');
      } else {
        showNotification('¡Bienvenido ' + esc(data.nombre || data.id) + '! Tu biblioteca está vacía.', 'success');
      }
    }
    
  } catch(e) {
    console.error('Login error:', e);
    showAuthError('Error al conectar: ' + e.message);
  }
}

// Logout with sync
async function handleLogoutWithSync() {
  // Sync songs before logging out
  if (currentUser && songs.length > 0 && supabaseReady) {
    console.log('Syncing songs before logout...');
    await syncSongsToCloud();
  }
  
  currentUser = null;
  localStorage.removeItem('rl_current_user');
  // Reset admin mode and role when logging out
  repAdmin = false;
  userRole = 'usuario';
  localStorage.removeItem('cb_rep_admin');
  updateUserUI();
  document.getElementById('user-dropdown').classList.remove('active');
  showNotification('Sesión cerrada', 'success');
}

// Add CSS for spinning animation
const syncStyle = document.createElement('style');
syncStyle.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}';
document.head.appendChild(syncStyle);

// Check online status and update indicator
function updateOnlineStatus() {
  if (navigator.onLine) {
    updateSyncStatus(currentUser ? 'synced' : 'offline');
  } else {
    updateSyncStatus('offline');
  }
}

window.addEventListener('online', () => {
  updateOnlineStatus();
  // Sync pending changes when coming back online
  if (currentUser && pendingSync) {
    syncSongsToCloud();
  }
});

window.addEventListener('offline', () => {
  updateSyncStatus('offline');
});

function showConnectionStatus(){
  const status=document.getElementById('rep-connection-status');
  if(!status)return;
  if(supabaseReady){status.innerHTML='<span style="color:#4ade80;font-size:.65rem">● Conectado</span>';}
  else{status.innerHTML='<span style="color:#f87171;font-size:.65rem">● Sin conexión - datos locales</span>';}
}

async function loadRepertorios(){
  if(!supabaseReady){return}
  try{
    const {data:reps,error:e1}=await supabaseClient.from('repertorios').select('*').order('fecha_domingo',{ascending:false});
    if(e1)throw e1;
    const {data:songsData,error:e2}=await supabaseClient.from('canciones_repertorio').select('*');
    if(e2)throw e2;
    // Load ALL vocal audios (shared across repertorios by source_song_id)
    let vocalAudios=[];
    try{
      const {data:vaData,error:vaErr}=await supabaseClient.from('vocal_audios').select('*');
      if(!vaErr&&vaData)vocalAudios=vaData.map(va=>({...va,audio_url:va.audio_url?normalizeVocalAudioUrl(va.audio_url):va.audio_url}));
    }catch(e){console.log('vocal_audios table may not exist yet')}
    
    // Build a map of source_song_id -> vocal_audios for quick lookup
    const vocalAudiosBySong={};
    vocalAudios.forEach(va=>{
      const key=va.source_song_id||va.cancion_repertorio_id;
      if(!vocalAudiosBySong[key])vocalAudiosBySong[key]=[];
      vocalAudiosBySong[key].push(va);
    });
    
        // Auto-archive repertorios whose lunes date has passed
    const today = new Date();
    today.setHours(0,0,0,0);
    for (const r of reps) {
      if (r.estado === 'activo' && r.fecha_lunes) {
        const lunesDate = new Date(r.fecha_lunes + 'T12:00:00');
        lunesDate.setHours(0,0,0,0);
        if (lunesDate < today) {
          r.estado = 'archivado';
          try {
            await supabaseClient.from('repertorios').update({estado: 'archivado'}).eq('id', r.id);
          } catch(e) { console.log('Auto-archive error:', e.message); }
        }
      }
    }
    repertorios=reps.sort((a,b)=>b.fecha_domingo>a.fecha_domingo?1:-1).map(r=>{
      const canciones=songsData.filter(s=>s.repertorio_id===r.id).sort((a,b)=>a.orden-b.orden);
      // Collect all vocal_audios for songs in this repertorio (by source_song_id)
      const repVocalAudios=[];
      canciones.forEach(s=>{
        const key=s.source_song_id||s.id;
        if(vocalAudiosBySong[key]){
          vocalAudiosBySong[key].forEach(va=>{
            // Avoid duplicates
            if(!repVocalAudios.find(x=>x.source_song_id===va.source_song_id&&x.coro_number===va.coro_number&&x.dia===va.dia)){
              repVocalAudios.push(va);
            }
          });
        }
      });
      return {...r, canciones, vocalAudios:repVocalAudios};
    });
    console.log('Loaded',repertorios.length,'repertorios');
  }catch(err){
    console.error('Error loading repertorios:',err);
    const c=document.getElementById('rep-list');
    if(c)c.innerHTML='<div class="empty"><h2 style="color:#f87171">Error de conexión</h2><p>'+err.message+'</p></div>';
  }
}

function transposeChord(chord,semitones){return chord.replace(/([A-G][#b]?)/g,(match)=>{const idx=NOTE_MAP[match];if(idx===undefined)return match;const newIdx=(idx+semitones+1200)%12;return useFlats?FLATS[newIdx]:SHARPS[newIdx]})}
function transposeLine(line,semitones){return line.replace(/\[([^\]]+)\]/g,(_,chord)=>'['+transposeChord(chord,semitones)+']')}
function getS(fromKey,toKey){const fi=NOTE_MAP[fromKey];const ti=NOTE_MAP[toKey];if(fi===undefined||ti===undefined)return 0;return(ti-fi+12)%12}
function detectKey(ly){const c={};let m;const r=/\[([^\]]+)\]/g;while((m=r.exec(ly))!==null){const rm=m[1].match(/^([A-G][#b]?)/);if(rm){const k=rm[1];c[k]=(c[k]||0)+1}}let mx=0,dk='C';for(const[k,v]of Object.entries(c)){if(v>mx){mx=v;dk=k}}return dk}

let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;showInstallBanner();showInstallFloat()});
function isIOS(){return/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1}
function isStandalone(){return window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true}
function showInstallFloat(){if(isStandalone())return;const btn=document.getElementById('install-float-btn');if(btn)btn.style.display='flex'}
function handleInstallClick(){if(isIOS()){document.getElementById('ios-install-modal').style.display='flex'}else{installApp()}}
function showInstallBanner(){if(!deferredPrompt)return;const c=document.getElementById('install-banner-container');if(c&&!c.innerHTML){c.innerHTML='<div class="install-banner" onclick="installApp()"><div style="font-size:24px">📱</div><div class="install-banner-text"><div class="install-banner-title">Instalar Repertorios RL</div><div class="install-banner-desc">Añadir a pantalla de inicio para usar como app</div></div><button class="install-banner-btn">Instalar</button></div>';showInstallFloat()}}
async function installApp(){if(!deferredPrompt)return;deferredPrompt.prompt();const r=await deferredPrompt.userChoice;deferredPrompt=null;document.getElementById('install-banner-container').innerHTML='';document.getElementById('install-float-btn').style.display='none'}
window.addEventListener('appinstalled',()=>{document.getElementById('install-banner-container').innerHTML='';document.getElementById('install-float-btn').style.display='none';deferredPrompt=null});
// Show install button for iOS users too (they can't use beforeinstallprompt)
if(isIOS()&&!isStandalone()){setTimeout(()=>{const btn=document.getElementById('install-float-btn');if(btn)btn.style.display='flex'},2000)}


function showPage(name){
  // Stop all audio when navigating
  stopAllAudio();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const pg=document.getElementById('page-'+name);if(pg)pg.classList.add('active');
  const nb=document.getElementById('nav-'+name);if(nb)nb.classList.add('active');
  if(name==='library')renderLibrary();
  if(name==='lists')renderLists();
  if(name==='repertorios'){showConnectionStatus();loadRepertorios().then(()=>renderRepertorios())}
  if(name==='repertorio')renderRepertorioView();
  if(name==='rep-song')renderRepSongView();
  if(name==='add'){if(!editingSongId)resetForm();renderKeyGrid()}
  if(name==='view')renderView();
  if(name==='listview')renderListView();
}

function goBackFromView(){
  if(viewReturnTo==='listview'){showPage('listview')}
  else{showPage('library')}
}

function renderLibrary(){
  const q=(document.getElementById('search-input').value||'').toLowerCase();
  let filtered=q?songs.filter(s=>s.title.toLowerCase().includes(q)||s.artist.toLowerCase().includes(q)):[...songs];
  // Sort alphabetically by title
  filtered.sort((a,b)=>a.title.localeCompare(b.title,'es',{sensitivity:'base'}));
  document.getElementById('song-count').textContent=songs.length+' canciones';
  const c=document.getElementById('song-list');
  if(filtered.length===0){
    c.innerHTML='<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>'+(songs.length===0?'Sin canciones aún':'Sin resultados')+'</h2><p>'+(songs.length===0?'Agrega tu primera canción o importa archivos':'Intenta con otra búsqueda')+'</p>'+(songs.length===0?'<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn btn-amber" onclick="showPage(\'add\')">Agregar canción</button><button class="btn btn-zinc" onclick="document.getElementById(\'import-input\').click()">Importar archivo</button></div>':'')+'</div>';
    return;
  }
  c.innerHTML=filtered.map(s=>{
    const pv=s.lyrics.split('\n').slice(0,3).join(' / ');
    const il=lists.filter(l=>l.songIds.includes(s.id)).length;
    return '<div class="card" onclick="viewSong(\''+s.id+'\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1;min-width:0"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> '+esc(s.title)+(s.tags.includes('Repertorio')&&!canEditRepSongs()?' 🔒':'')+'</div><div class="card-artist">'+esc(s.artist)+'</div><div class="card-preview">'+esc(pv)+'</div><div class="card-meta"><span class="tag tag-key">'+dn(s.originalKey)+'</span>'+(s.tempo?'<span class="tag tag-zinc">'+s.tempo+' BPM</span>':'')+(s.compas?'<span class="tag tag-zinc">'+s.compas+'</span>':'')+s.tags.slice(0,2).map(t=>'<span class="tag tag-zinc">'+esc(t)+'</span>').join('')+(il>0?'<span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> '+il+'</span>':'')+(s.audio_url?'<span class="tag" style="background:rgba(34,197,94,.2);color:#4ade80">🎵 Audio</span>':'')+'</div></div><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">'+(canUploadAudio()?'<button class="btn-icon" onclick="event.stopPropagation();triggerAudioUpload(\''+s.id+'\')" data-audio-upload="'+s.id+'" title="'+(s.audio_url?'Cambiar audio':'Subir audio')+'" style="color:'+(s.audio_url?'#4ade80':'#71717a')+'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>':'')+'<button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteSong(\''+s.id+'\')" title="Eliminar de biblioteca" style="flex-shrink:0;align-self:flex-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>'+'</div></div></div>';
  }).join('');
}

function renderKeyGrid(){document.getElementById('key-grid-form').innerHTML=KEY_VALUES.map((k,i)=>'<button class="key-option '+(formKey===k?'current':'other')+'" onclick="formKey=\''+k+'\';renderKeyGrid()">'+KEY_NAMES[i]+'</button>').join('')}
function resetForm(){editingSongId=null;document.getElementById('form-title').textContent='Nueva canción';document.getElementById('input-title').value='';document.getElementById('input-artist').value='';document.getElementById('input-lyrics').value='';document.getElementById('input-tempo').value='';document.getElementById('input-compas').value='';formKey='C';formTags=[];renderFormTags();renderKeyGrid()}
function renderFormTags(){document.getElementById('tag-list').innerHTML=formTags.map(t=>'<span class="tag-item">'+esc(t)+' <button class="tag-remove" onclick="removeFormTag(\''+esc(t)+'\')">×</button></span>').join('')}
function addTag(){const i=document.getElementById('input-tag'),t=i.value.trim();if(t&&!formTags.includes(t)){formTags.push(t);renderFormTags()}i.value=''}
function removeFormTag(t){formTags=formTags.filter(x=>x!==t);renderFormTags()}
function toggleHelp(){document.getElementById('help-box').classList.toggle('hidden')}
function saveSong(){
  const t=document.getElementById('input-title').value.trim(),a=document.getElementById('input-artist').value.trim()||'Desconocido',l=document.getElementById('input-lyrics').value.trim();
  const bpm=parseInt(document.getElementById('input-tempo').value)||0;
  const cmp=document.getElementById('input-compas').value.trim()||'';
  if(!t||!l){alert('Título y letra son obligatorios');return}
  if(editingSongId){
    const i=songs.findIndex(s=>s.id===editingSongId);
    if(i!==-1){
      var userName=currentUser?(currentUser.nombre?currentUser.nombre+' '+(currentUser.apellido||''):currentUser.id):'';
      songs[i]={...songs[i],title:t,artist:a,lyrics:l,originalKey:formKey,tags:[...formTags],tempo:bpm||songs[i].tempo||0,compas:cmp||songs[i].compas||'',audio_url:songs[i].audio_url||null,updatedAt:Date.now(),modifiedBy:userName||songs[i].modifiedBy||''};
      // Sync edits to all repertorio and user copies
      syncRepertorioFromLibrary(songs[i]);
    }
  }
  else{
    var dk=detectKey(l);
    var creatorName=currentUser?(currentUser.nombre?currentUser.nombre+' '+(currentUser.apellido||''):currentUser.id):'';
    songs.unshift({id:genId(),title:t,artist:a,lyrics:l,originalKey:formKey||dk,currentKey:formKey||dk,tags:[...formTags],tempo:bpm,compas:cmp,audio_url:null,createdAt:Date.now(),updatedAt:Date.now(),createdBy:creatorName||''})
  }
  save('cb_songs',songs);editingSongId=null;showPage('library');
  // Sync to cloud if logged in
  if(currentUser&&supabaseReady){syncSongsToCloud()}
}

// Sync repertorio song changes to ALL users' libraries (FIXED: propagation bug)
async function syncRepertorioToAllUsers(cancion,songId){
  if(!supabaseReady)return;
  try{
    // Find all user_songs that match this song by source_song_id
    // FIXED: Added .limit(10000) to avoid Supabase default 1000-row limit
    const {data:matches,error:selErr}=await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
    if(selErr){console.error('syncRepertorioToAllUsers select error:',selErr);return;}
    if(!matches||matches.length===0){console.log('syncRepertorioToAllUsers: no user_songs found');return;}
    
    let updatedCount=0;
    for(const m of matches){
      try{
        // song_data is a JSON STRING, must parse it
        const sd=typeof m.song_data==='string'?JSON.parse(m.song_data):m.song_data;
        
        // Match by source_song_id (the universal identifier)
        // FIXED: Also check sourceId field and repSongId for robust matching
        const matchesId=(sd.id===songId)||
                         (sd.sourceId&&sd.sourceId===songId)||
                         (sd.repSongId&&sd.repSongId===songId);
        
        if(matchesId){
          const updated={
            ...sd,
            title:cancion.titulo||sd.title,
            artist:cancion.artista||sd.artist,
            lyrics:cancion.letra_acordes||sd.lyrics,
            originalKey:cancion.tono_original||sd.originalKey,
            tempo:cancion.tempo||sd.tempo,
            compas:cancion.compas||sd.compas,
            // FIXED: Always use cancion.audio_url if provided (even if null/undefined means "no audio")
            // Only fall back to sd.audio_url if cancion.audio_url is literally undefined (not passed)
            audio_url:('audio_url' in cancion)?cancion.audio_url:sd.audio_url,
            modifiedBy:cancion.modificado_por||cancion.modifiedBy||sd.modifiedBy||'',
            updatedAt:Date.now()
          };
          const {error:updErr}=await supabaseClient.from('user_songs').update({
            song_data:JSON.stringify(updated),
            updated_at:Date.now()
          }).eq('id',m.id);
          if(updErr){console.error('syncRepertorioToAllUsers update error for',m.id,':',updErr);}
          else{updatedCount++;console.log('Updated user_song:',m.id,'for song:',songId);}
        }
      }catch(parseErr){console.error('syncRepertorioToAllUsers parse error:',parseErr);}
    }
    console.log('syncRepertorioToAllUsers: checked',matches.length,'rows, updated',updatedCount,'for song:',songId);
  }catch(e){console.error('Sync to all users error:',e)}
}

// Override the original functions with sync versions
window.handleLogin = handleLoginWithSync;
window.handleLogout = handleLogoutWithSync;
function editSong(){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;if(!canEditRepSongs()&&s.tags&&s.tags.includes('Repertorio')){alert('Solo admin o directores musicales pueden editar canciones de repertorio');return}editingSongId=s.id;document.getElementById('form-title').textContent='Editar canción';document.getElementById('input-title').value=s.title;document.getElementById('input-artist').value=s.artist;document.getElementById('input-lyrics').value=s.lyrics;document.getElementById('input-tempo').value=s.tempo||'';document.getElementById('input-compas').value=s.compas||'';formKey=s.originalKey;formTags=[...s.tags];renderFormTags();renderKeyGrid();showPage('add')}
function saveRepSongToLibrary(){const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;const s=r.canciones.find(x=>x.id===viewingRepSongId);if(!s)return;const existing=songs.find(x=>x.title===s.titulo&&x.artist===s.artista);if(existing){alert('Esta canción ya está en tu biblioteca');return}const dk=s.tono_original||'C';var libCreatorName=currentUser?(currentUser.nombre?currentUser.nombre+' '+(currentUser.apellido||''):currentUser.id):'';songs.unshift({id:s.source_song_id||genId(),sourceId:s.source_song_id||s.id,repSongId:s.id,sourceType:'repertorio',title:s.titulo||'Sin título',artist:s.artista||'Desconocido',lyrics:s.letra_acordes||'',originalKey:dk,currentKey:dk,tags:s.tags||['Repertorio'],tempo:s.tempo||0,compas:s.compas||'',audio_url:s.audio_url||null,repSongId:s.id,repId:r.id,createdAt:Date.now(),updatedAt:Date.now(),createdBy:libCreatorName||''});save('cb_songs',songs);const btn=document.getElementById('save-rep-btn');if(btn){btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Guardada';btn.style.background='rgba(34,197,94,.2)';btn.style.color='#4ade80';btn.style.borderColor='rgba(34,197,94,.3)';btn.disabled=true}if(currentUser&&supabaseReady){syncSongsToCloud()}}
function isRepSongInLibrary(){const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return false;const s=r.canciones.find(x=>x.id===viewingRepSongId);if(!s)return false;return!!songs.find(x=>x.title===s.titulo&&x.artist===s.artista)}

// Sync admin library edits to all repertorio copies (FIXED: propagation bug)
async function syncRepertorioFromLibrary(libSong){
  if(!supabaseReady)return;
  try{
    // FIXED: Also try to match by source_song_id for more reliable matching
    let repSongs=[];
    // First try: match by source_song_id (most reliable)
    try{
      const {data:byId,error:e1}=await supabaseClient.from('canciones_repertorio').select('*').eq('source_song_id',libSong.id);
      if(!e1&&byId&&byId.length>0)repSongs=byId;
    }catch(e){}
    // Second try: match by title + artist (fallback)
    if(repSongs.length===0){
      try{
        const {data:byTitle,error:e2}=await supabaseClient.from('canciones_repertorio').select('*').eq('titulo',libSong.title).eq('artista',libSong.artist);
        if(!e2&&byTitle)repSongs=byTitle;
      }catch(e){}
    }
    if(repSongs.length===0)return;
    const updates={titulo:libSong.title,artista:libSong.artist,tono_original:libSong.originalKey,tempo:libSong.tempo||0,compas:libSong.compas||'',letra_acordes:libSong.lyrics,audio_url:libSong.audio_url||null,fecha_modificacion:Date.now(),modificado_por:libSong.modifiedBy||''};
    for(const rs of repSongs){
      await supabaseClient.from('canciones_repertorio').update(updates).eq('id',rs.id);
    }
    console.log('Synced',repSongs.length,'repertorio copies for:',libSong.title);
    // Also sync to ALL other users' libraries
    await syncRepertorioToAllUsers({titulo:libSong.title,artista:libSong.artist,letra_acordes:libSong.lyrics,tono_original:libSong.originalKey,tempo:libSong.tempo,compas:libSong.compas,audio_url:libSong.audio_url},libSong.id);
  }catch(e){console.error('Sync repertorio error:',e)}
}

// Sync user library copies when admin edits a song (FIXED: also check sourceId)
function syncUserCopies(libSong){
  let changed=false;
  songs.forEach(s=>{
    // FIXED: Also match by sourceId for repertorio-sourced songs
    const isSameSong=(s.id!==libSong.id)&&(
      (s.title===libSong.title&&s.artist===libSong.artist)||
      (s.sourceId&&s.sourceId===libSong.id)||
      (s.id===libSong.id)
    );
    if(isSameSong){
      s.lyrics=libSong.lyrics;
      s.originalKey=libSong.originalKey;
      s.tempo=libSong.tempo;
      s.compas=libSong.compas;
      s.audio_url=libSong.audio_url;
      s.updatedAt=Date.now();
      changed=true;
    }
  });
  if(changed){save('cb_songs',songs);console.log('Synced user copies for:',libSong.title)}
}

function viewSong(id){viewingSongId=id;viewReturnTo=null;showPage('view')}
async function renderView(){
  const s=songs.find(x=>x.id===viewingSongId);if(!s)return;
  // Show nav bar if coming from a list
  const nav=document.getElementById('view-nav');
  if(viewReturnTo==='listview'&&viewingListId){
    const l=lists.find(x=>x.id===viewingListId);
    if(l){
      const listSongs=l.songIds.map(sid=>songs.find(x=>x.id===sid)).filter(Boolean);
      if(listSongs.length>1){
        nav.classList.remove('hidden');
        document.getElementById('view-nav-info').textContent=(listNavIndex+1)+' / '+listSongs.length;
        document.getElementById('view-prev-btn').disabled=listNavIndex<=0;
        document.getElementById('view-next-btn').disabled=listNavIndex>=listSongs.length-1;
      }else{nav.classList.add('hidden')}
    }else{nav.classList.add('hidden')}
  }else{nav.classList.add('hidden')}
  const ntBtn=document.getElementById('lib-notation-toggle');if(ntBtn)ntBtn.innerHTML=useFlats?'♭':'#';
  const metaParts=[];
  if(s.tempo)metaParts.push(s.tempo+' BPM');
  if(s.compas)metaParts.push(s.compas);
  document.getElementById('view-song-info').innerHTML='<h1 style="font-size:1.1rem;font-weight:700;color:#fff">'+esc(s.title)+'</h1><p style="font-size:.8rem;color:#a1a1aa">'+esc(s.artist)+'</p>'+(metaParts.length>0?'<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">'+metaParts.map(m=>'<span class="tag tag-zinc">'+m+'</span>').join('')+'</div>':'');
  var _vnSrc=s.sourceId||s.id;document.getElementById('view-key-selector').innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;width:100%">'+'<button class="key-btn" onclick="changeKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button><button id="lib-notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">'+(useFlats?'\u266D':'#')+'</button><div class="key-display"><div class="key-note">'+dn(s.currentKey)+'</div>'+(s.currentKey!==s.originalKey?'<button class="key-original" onclick="resetKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: '+dn(s.originalKey)+'</button>':'')+'</div><button class="key-btn" onclick="changeKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>'+'<div class="lib-notes-row">'+(_vnSrc?'<button class="lib-notes-btn" onclick="toggleVocalNotesLib(\''+_vnSrc+'\',\'domingo\',this)">\u{1f4dd} Domingo</button><button class="lib-notes-btn" onclick="toggleVocalNotesLib(\''+_vnSrc+'\',\'lunes\',this)">\u{1f4dd} Lunes</button>':'')+'</div></div>';
if(libVocalMode){document.querySelectorAll('.lib-notes-btn').forEach(function(b){b.classList.remove('active');if(b.getAttribute('onclick')&&b.getAttribute('onclick').indexOf(libVocalMode)!==-1)b.classList.add('active')})}
  const il=lists.filter(l=>l.songIds.includes(s.id));
  document.getElementById('view-song-location').innerHTML=il.length>0?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> En listas: '+il.map(l=>l.name).join(', '):'';
  // Audio section in view page
  const audioSection=document.getElementById('view-audio-section');
  if(s.audio_url){
    audioSection.innerHTML='<div class="audio-player" id="view-audio-player"><button class="audio-play-btn" onclick="toggleViewAudio()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekViewAudio(event)" ontouchmove="seekViewAudioTouch(event)"><div class="audio-bar-fill" id="view-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="view-audio-current">0:00</span><span id="view-audio-duration">--:--</span></div></div>'+(canUploadAudio()?'<button class="btn-icon" onclick="triggerAudioUpload(\''+s.id+'\')" title="Cambiar audio" style="color:#71717a"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button><button class="btn-icon btn-icon-red" onclick="removeSongAudio(\''+s.id+'\')" title="Eliminar audio" style="color:#f87171"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>':'')+'</div>';
  }else{
    audioSection.innerHTML=''+(canUploadAudio()?'<div class="upload-zone" onclick="triggerAudioUpload(\''+s.id+'\')" id="view-upload-zone"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" style="margin:0 auto 8px;display:block"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p style="font-size:.8rem;color:#a1a1aa;margin-bottom:4px">Subir audio de esta canción</p><p style="font-size:.65rem;color:#71717a">MP3, WAV, OGG — el audio quedará vinculado a la canción</p></div>':'')+'';
  }
  const semi=getS(s.originalKey,s.currentKey);
  var _vnSrc2=s.sourceId||s.id;var _vocalNotes={};if(libVocalMode&&_vnSrc2){_vocalNotes=await loadSectionNotes(_vnSrc2,libVocalMode)}if(libVocalMode){var _libLines=[];s.lyrics.split('\n').forEach(function(line){var t=semi!==0?transposeLine(line,semi):line;if(/\[[^\]]+\]/.test(t)){var stripped=t.replace(/\s*\[[^\]]+\]\s*/g,' ').trim();if(!stripped){return}var h2='<div class="lyrics-line">';if(/\(([^)]+)\)/.test(stripped)){var secMatch=t.match(/\(([^)]+)\)/);var secName=secMatch?secMatch[1]:'';var idMatch=t.match(/\)\s*\{(\d+)\}/);var secId=idMatch?idMatch[1]:'';var noteKey=secId?secName+'_'+secId:secName;var noteVal=(_vocalNotes[noteKey]||'').replace(/"/g,'&quot;');var displayLine=stripped.replace(/\s*\{\d+\}/g,'');h2+=displayLine.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');if(_vocalNotes[noteKey]){h2+='<span class="section-note-display">'+esc(_vocalNotes[noteKey])+'</span>'}}else{h2+=stripped}_libLines.push(h2+'</div>')}else if(/\(([^)]+)\)/.test(t)){var secMatch2=t.match(/\(([^)]+)\)/);var secName2=secMatch2?secMatch2[1]:'';var idMatch2=t.match(/\)\s*\{(\d+)\}/);var secId2=idMatch2?idMatch2[1]:'';var noteKey2=secId2?secName2+'_'+secId2:secName2;var noteVal2=(_vocalNotes[noteKey2]||'').replace(/"/g,'&quot;');var displayLine2=t.replace(/\s*\{\d+\}/g,'');var h3='<div class="lyrics-line">'+displayLine2.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');if(_vocalNotes[noteKey2]){h3+='<span class="section-note-display">'+esc(_vocalNotes[noteKey2])+'</span>'}_libLines.push(h3+'</div>')}else{_libLines.push('<div class="lyrics-line">'+(t||'&nbsp;')+'</div>')}});document.getElementById('view-lyrics').innerHTML=_libLines.join('')}else{document.getElementById('view-lyrics').innerHTML=s.lyrics.split('\n').map(line=>{const t=semi!==0?transposeLine(line,semi):line;if(/\[[^\]]+\]/.test(t)){let h='<div class="lyrics-line">'+t.replace(/\[([^\]]+)\]/g,(m,p1)=>'<span class="chord">'+displayChord(p1)+'</span>');h=h.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');h=h.replace(/\s*\{\d+\}/g,'');return h+'</div>'}if(/\([^)]+\)/.test(line)){var _dl=line.replace(/\s*\{\d+\}/g,'');return'<div class="lyrics-line">'+_dl.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>')+'</div>'}return'<div class="lyrics-line">'+(line||'&nbsp;')+'</div>'}).join('')}
  document.getElementById('view-tags').innerHTML=s.tags.map(t=>'<span class="tag tag-zinc">'+esc(t)+'</span>').join('')+getSongNoteHtml(s);
  // Hide edit button for non-admin users on repertorio songs (delete is always visible - users can remove from their library)
  const isRepSong=s.tags&&s.tags.includes('Repertorio');
  const editBtn=document.querySelector('#page-view .btn-icon[title="Editar"]');
  if(editBtn)editBtn.style.display=(!canEditRepSongs()&&isRepSong)?'none':'';
}
function changeKey(delta){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;const currentIdx=NOTE_MAP[s.currentKey]??0;const newIdx=(currentIdx+delta+12)%12;s.currentKey=useFlats?FLATS[newIdx]:SHARPS[newIdx];save('cb_songs',songs);renderView()}
function resetKey(){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;s.currentKey=s.originalKey;save('cb_songs',songs);renderView()}
async function confirmDeleteSong(id){
  const s=songs.find(x=>x.id===id);
  if(!confirm('¿Eliminar esta canción de tu biblioteca?')){return}
  
  const songId=s?s.id:id;
  
  // CLEANUP: Delete audio from R2 ONLY if this is NOT a repertorio song
  // Repertorio songs have their own audio managed separately
  if(!s||!s.tags||!s.tags.includes('Repertorio')){
    const extensions=['mp3','wav','ogg','m4a','aac','flac','webm'];
    for(const ext of extensions){
      try{
        await fetch(R2_WORKER_URL+'/file/songs/'+songId+'.'+ext,{method:'DELETE'});
      }catch(e){}
    }
    if(s&&s.audio_url){
      try{
        await fetch(R2_WORKER_URL+'/file/'+extractR2Key(s.audio_url),{method:'DELETE'});
      }catch(e){}
    }
  }
  
  // CRITICAL FIX: Do NOT delete from canciones_repertorio here
  // Deleting from library should NEVER affect repertorios
  // Only remove from local songs array and lists
  
  songs=songs.filter(s=>s.id!==id);
  lists.forEach(l=>l.songIds=l.songIds.filter(sid=>sid!==id));
  save('cb_songs',songs);save('cb_lists',lists);
  renderLibrary();
  if(currentUser&&supabaseReady){syncSongsToCloud()}
}
async function deleteCurrentSong(){
  const s=songs.find(x=>x.id===viewingSongId);
  if(!confirm('¿Eliminar esta canción de tu biblioteca?')){return}
  
  const songId=s?s.id:viewingSongId;
  
  // CLEANUP: Delete audio from R2 ONLY if this is NOT a repertorio song
  if(!s||!s.tags||!s.tags.includes('Repertorio')){
    const extensions=['mp3','wav','ogg','m4a','aac','flac','webm'];
    for(const ext of extensions){
      try{
        await fetch(R2_WORKER_URL+'/file/songs/'+songId+'.'+ext,{method:'DELETE'});
      }catch(e){}
    }
    if(s&&s.audio_url){
      try{
        await fetch(R2_WORKER_URL+'/file/'+extractR2Key(s.audio_url),{method:'DELETE'});
      }catch(e){}
    }
  }
  
  // CRITICAL FIX: Do NOT delete from canciones_repertorio here
  // Deleting from library should NEVER affect repertorios
  
  songs=songs.filter(s=>s.id!==viewingSongId);
  lists.forEach(l=>l.songIds=l.songIds.filter(sid=>sid!==viewingSongId));
  save('cb_songs',songs);save('cb_lists',lists);
  showPage('library');
  if(currentUser&&supabaseReady){syncSongsToCloud()}
}

function exportSong(){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;dlJson({type:'chordbook-song',version:2,id:s.id,audio_url:s.audio_url||null,songs:[{id:s.id,title:s.title,artist:s.artist,lyrics:s.lyrics,originalKey:s.originalKey,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags,audio_url:s.audio_url||null}]},s.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json')}

function shareSong(){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;const data={type:'chordbook-song',version:2,id:s.id,audio_url:s.audio_url||null,songs:[{id:s.id,title:s.title,artist:s.artist,lyrics:s.lyrics,originalKey:s.originalKey,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags,audio_url:s.audio_url||null}]};const text=JSON.stringify(data);if(navigator.share){navigator.share({title:s.title+' - ChordBook',text:'🎵 '+s.title+' - '+s.artist}).then(()=>{dlJson(data,s.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json')}).catch(()=>{dlJson(data,s.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json')})}else{navigator.clipboard.writeText(text).then(()=>{showNotif('import-notification','JSON copiado. Pégalo donde quieras para compartir.','success')}).catch(()=>{dlJson(data,s.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json')})}}
function dlJson(d,f){const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=f;a.click();URL.revokeObjectURL(u)}

// View audio player
let viewAudioEl=null;let viewAudioPlaying=false;let viewAudioInterval=null;
function toggleViewAudio(){
  const s=songs.find(x=>x.id===viewingSongId);if(!s||!s.audio_url)return;
  // Normalize URL to fix any path issues
  const audioUrl=normalizeVocalAudioUrl(s.audio_url);
  console.log('Attempting to play audio:',audioUrl);
  if(!viewAudioEl){
    viewAudioEl=new Audio();
    viewAudioEl.crossOrigin='anonymous';
    viewAudioEl.preload='auto';
    viewAudioEl.addEventListener('ended',()=>{viewAudioPlaying=false;updateViewAudioBtn()});
    viewAudioEl.addEventListener('loadedmetadata',()=>{const dur=document.getElementById('view-audio-duration');if(dur)dur.textContent=formatTime(viewAudioEl.duration);console.log('Audio loaded, duration:',viewAudioEl.duration)});
    viewAudioEl.addEventListener('error',()=>{
      const err=viewAudioEl.error;
      console.error('Audio error:',err?'Code: '+err.code+', Message: '+err.message:'Unknown','URL:',audioUrl);
      // Try R2 fallback
      if(s.id){const r2Url=R2_WORKER_URL+'/file/songs/'+s.id+'.mp3';console.log('Trying R2 fallback:',r2Url);viewAudioEl.src=r2Url;}
      else{alert('Error al cargar el audio');viewAudioPlaying=false;updateViewAudioBtn()}
    });
    viewAudioEl.addEventListener('canplay',()=>{console.log('Audio can play')});
    viewAudioEl.src=audioUrl;
  }
  if(viewAudioPlaying){viewAudioEl.pause();viewAudioPlaying=false}
  else{viewAudioEl.play().catch(e=>{console.error('Play error:',e)});viewAudioPlaying=true}
  updateViewAudioBtn();
}
function updateViewAudioBtn(){
  const icon=document.getElementById('view-audio-icon');if(!icon)return;
  if(viewAudioPlaying){
    icon.outerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5" id="view-audio-icon"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    startViewAudioProgress();
  }else{
    icon.outerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" id="view-audio-icon"><polygon points="5,3 19,12 5,21"/></svg>';
    stopViewAudioProgress();
  }
}
function startViewAudioProgress(){
  stopViewAudioProgress();
  viewAudioInterval=setInterval(()=>{
    if(!viewAudioEl)return;
    const pct=viewAudioEl.duration?(viewAudioEl.currentTime/viewAudioEl.duration)*100:0;
    const fill=document.getElementById('view-audio-fill');if(fill)fill.style.width=pct+'%';
    const cur=document.getElementById('view-audio-current');if(cur)cur.textContent=formatTime(viewAudioEl.currentTime);
  },250);
}
function stopViewAudioProgress(){if(viewAudioInterval){clearInterval(viewAudioInterval);viewAudioInterval=null}}
function formatTime(s){if(!s||isNaN(s))return'0:00';const m=Math.floor(s/60);const sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}

document.getElementById('import-input').addEventListener('change',async function(e){
  const files=e.target.files;if(!files||!files.length)return;let total=0;
  for(const file of Array.from(files)){
    const ext=file.name.split('.').pop().toLowerCase(),content=await file.text();
    if(ext==='json'){
      try{const d=JSON.parse(content);
        if(d.type==='chordbook-song'&&Array.isArray(d.songs)){
          d.songs.forEach(s=>{
            // v2: use id from JSON if present (linked import, no duplicates)
            const songId=s.id||d.id||genId();
            const existing=songs.find(x=>x.id===songId);
            if(!existing){
              const dk=s.originalKey||(s.lyrics?detectKey(s.lyrics):'C');
              songs.unshift({id:songId,sourceId:s.id||d.id||null,sourceType:s.id?'imported':undefined,title:s.title||'Sin título',artist:s.artist||'Desconocido',lyrics:s.lyrics||'',originalKey:dk,currentKey:dk,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags||[],audio_url:s.audio_url||d.audio_url||null,createdAt:Date.now(),updatedAt:Date.now()});
              total++;
            }
          })
        }
        if(d.type==='chordbook-list'){importListData(d)}
      }catch{}
    }else if(ext==='txt'){
      const parsed=parseSongFilename(file.name);
      const dk=parsed.key?(NOTE_MAP[parsed.key]!==undefined?dn(parsed.key):parsed.key):(detectKey(content));
      songs.unshift({id:genId(),title:parsed.title,artist:parsed.artist,lyrics:content.trim(),originalKey:dk,currentKey:dk,tempo:parsed.bpm||0,compas:'',tags:[],createdAt:Date.now(),updatedAt:Date.now()});total++;
    }
  }
  save('cb_songs',songs);e.target.value='';showNotif('import-notification',total+' canciones importadas','success');renderLibrary();
  if(currentUser&&supabaseReady){syncSongsToCloud()}
});

document.getElementById('import-list-input').addEventListener('change',async function(e){
  const files=e.target.files;if(!files||!files.length)return;let imported=0;
  for(const file of Array.from(files)){
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='json'){
      try{const content=await file.text(),d=JSON.parse(content);
        if(d.type==='chordbook-list'){importListData(d);imported++}
        else if(d.type==='chordbook-song'&&Array.isArray(d.songs)){
          const listName=file.name.replace(/\.[^/.]+$/,'').replace(/[_-]/g,' ').trim()||'Lista importada';
          const lid=genId();
          const songIds=[];
          d.songs.forEach(s=>{
            const songId=s.id||d.id||genId();
            let existing=songs.find(x=>x.id===songId);
            if(!existing){
              const dk=s.originalKey||(s.lyrics?detectKey(s.lyrics):'C');
              songs.push({id:songId,sourceId:s.id||d.id||null,sourceType:s.id?'imported':undefined,title:s.title||'Sin título',artist:s.artist||'Desconocido',lyrics:s.lyrics||'',originalKey:dk,currentKey:dk,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags||[],audio_url:s.audio_url||d.audio_url||null,createdAt:Date.now(),updatedAt:Date.now()});
            }
            songIds.push(songId);
          });
          if(songIds.length>0){lists.unshift({id:lid,name:listName,description:'',songIds,createdAt:Date.now(),updatedAt:Date.now()})}
          imported++;
        }
      }catch{}
    }
  }
  save('cb_songs',songs);save('cb_lists',lists);e.target.value='';showNotif('import-list-notification',imported+' listas importadas','success');renderLists();
  if(currentUser&&supabaseReady){syncSongsToCloud()}
});

function importListData(d){
  // Import songs first (v2: with IDs for linked import)
  if(Array.isArray(d.songs)){
    d.songs.forEach(s=>{
      const songId=s.id||genId();
      const existing=songs.find(x=>x.id===songId);
      if(!existing){
        const dk=s.originalKey||(s.lyrics?detectKey(s.lyrics):'C');
        songs.push({id:songId,sourceId:s.id||null,sourceType:s.id?'imported':undefined,title:s.title||'Sin título',artist:s.artist||'Desconocido',lyrics:s.lyrics||'',originalKey:dk,currentKey:dk,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags||[],audio_url:s.audio_url||null,createdAt:Date.now(),updatedAt:Date.now()});
      }
    });
  }
  // Create or merge list
  const existing=lists.find(l=>l.name===d.list?.name);
  if(existing){
    const newIds=[...new Set([...existing.songIds,...(d.list?.songIds||[])])];
    existing.songIds=newIds;existing.updatedAt=Date.now();
  }else{
    lists.unshift({id:genId(),name:d.list?.name||'Lista importada',description:d.list?.description||'',songIds:d.list?.songIds||[],createdAt:Date.now(),updatedAt:Date.now()});
  }
}

function showNotif(id,msg,type){const n=document.getElementById(id);n.innerHTML='<div class="notification notification-'+type+'">'+(type==='success'?'✓':'✕')+' '+msg+'</div>';setTimeout(()=>{n.innerHTML=''},3000)}

function renderLists(){
  document.getElementById('list-count').textContent=lists.length+' listas';
  const c=document.getElementById('list-list');
  if(lists.length===0){c.innerHTML='<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg></div><h2>Sin listas aún</h2><p>Crea listas para organizar tus canciones</p><button class="btn btn-amber" onclick="showNewListForm()">Crear primera lista</button></div>';return}
  c.innerHTML=lists.map(l=>{
    const sc=l.songIds.length;
    return '<div class="card" onclick="viewList(\''+l.id+'\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><div style="flex:1"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg> '+esc(l.name)+'</div>'+(l.description?'<p style="font-size:.7rem;color:#71717a;margin-left:20px">'+esc(l.description)+'</p>':'')+'<div style="display:flex;gap:6px;margin-top:6px;margin-left:20px"><span class="tag-list"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> '+sc+' canciones</span></div></div><div style="display:flex;gap:2px"><button class="btn-icon" onclick="event.stopPropagation();shareList(\''+l.id+'\')" title="Exportar / Compartir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();confirmDeleteList(\''+l.id+'\')" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div></div>';
  }).join('');
}
function showNewListForm(){document.getElementById('new-list-form').classList.remove('hidden');document.getElementById('input-list-name').focus()}
function hideNewListForm(){document.getElementById('new-list-form').classList.add('hidden');document.getElementById('input-list-name').value='';document.getElementById('input-list-desc').value=''}
function createList(){const n=document.getElementById('input-list-name').value.trim();if(!n)return;lists.unshift({id:genId(),name:n,description:document.getElementById('input-list-desc').value.trim(),songIds:[],createdAt:Date.now(),updatedAt:Date.now()});save('cb_lists',lists);hideNewListForm();renderLists()}
function confirmDeleteList(id){if(confirm('¿Eliminar esta lista?')){lists=lists.filter(l=>l.id!==id);save('cb_lists',lists);renderLists()}}
function exportList(id){const l=lists.find(x=>x.id===id);if(!l)return;const ls=songs.filter(s=>l.songIds.includes(s.id));dlJson({type:'chordbook-list',version:2,list:{name:l.name,description:l.description,songIds:l.songIds},songs:ls.map(s=>({id:s.id,title:s.title,artist:s.artist,lyrics:s.lyrics,originalKey:s.originalKey,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags,audio_url:s.audio_url||null}))},'lista-'+l.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json')}
function exportCurrentList(){exportList(viewingListId)}

function shareList(id){const l=lists.find(x=>x.id===id);if(!l)return;const ls=songs.filter(s=>l.songIds.includes(s.id));const data={type:'chordbook-list',version:2,list:{name:l.name,description:l.description,songIds:l.songIds},songs:ls.map(s=>({id:s.id,title:s.title,artist:s.artist,lyrics:s.lyrics,originalKey:s.originalKey,tempo:s.tempo||0,compas:s.compas||'',tags:s.tags,audio_url:s.audio_url||null}))};const text=JSON.stringify(data);const fname='lista-'+l.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'.json';if(navigator.share){navigator.share({title:l.name+' - ChordBook',text:'📋 Lista: '+l.name+' ('+ls.length+' canciones)'}).then(()=>{dlJson(data,fname)}).catch(()=>{dlJson(data,fname)})}else{navigator.clipboard.writeText(text).then(()=>{showNotif('import-list-notification','JSON de lista copiado. Pégalo donde quieras.','success')}).catch(()=>{dlJson(data,fname)})}}
function shareCurrentList(){shareList(viewingListId)}

function viewList(id){viewingListId=id;listNavIndex=0;showPage('listview')}
function renderListView(){
  const l=lists.find(x=>x.id===viewingListId);if(!l)return;
  const listSongs=l.songIds.map(sid=>songs.find(s=>s.id===sid)).filter(Boolean);
  const missingSongs=l.songIds.filter(sid=>!songs.find(s=>s.id===sid));
  document.getElementById('listview-header').innerHTML='<div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;background:rgba(245,158,11,.2);border-radius:10px;display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><div><h1 style="font-size:1.1rem;font-weight:700;color:#fff">'+esc(l.name)+'</h1>'+(l.description?'<p style="font-size:.7rem;color:#71717a">'+esc(l.description)+'</p>':'')+'<p style="font-size:.7rem;color:#71717a">'+listSongs.length+' canciones</p></div></div>';
  const mc=document.getElementById('listview-missing');
  if(missingSongs.length>0){mc.innerHTML='<div class="missing-songs"><div class="missing-songs-title">⚠ '+missingSongs.length+' canciones no están en tu biblioteca</div>'+missingSongs.map(sid=>'<div class="missing-song-item"><span>Song ID: '+sid.substring(0,8)+'...</span><button class="missing-song-add" onclick="addMissingToList(\''+l.id+'\',\''+sid+'\')">Añadir placeholder</button></div>').join('')+'</div>';}else{mc.innerHTML=''}
  const container=document.getElementById('listview-songs');
  if(listSongs.length===0){container.innerHTML='<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>Lista vacía</h2><p>Añade canciones desde la biblioteca</p><button class="btn btn-amber" onclick="showPage(\'library\')">Ir a biblioteca</button></div>';return}
  container.innerHTML=listSongs.map(s=>{const pv=s.lyrics.split('\n').slice(0,3).join(' / ');return '<div class="card" onclick="viewSongFromList(\''+s.id+'\')" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px"><div style="flex:1;min-width:0"><div class="card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> '+esc(s.title)+'</div><div class="card-artist">'+esc(s.artist)+'</div><div class="card-preview">'+esc(pv)+'</div><div class="card-meta"><span class="tag tag-key">'+dn(s.originalKey)+'</span>'+s.tags.slice(0,2).map(t=>'<span class="tag tag-zinc">'+esc(t)+'</span>').join('')+'</div></div><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();removeFromList(\''+s.id+'\')" title="Quitar" style="align-self:flex-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>';}).join('');
}
function listNav(dir){const l=lists.find(x=>x.id===viewingListId);if(!l)return;const listSongs=l.songIds.map(sid=>songs.find(s=>s.id===sid)).filter(Boolean);const newIdx=listNavIndex+dir;if(newIdx>=0&&newIdx<listSongs.length){listNavIndex=newIdx;viewingSongId=listSongs[newIdx].id;viewReturnTo='listview';showPage('view')}}
function viewNav(dir){listNav(dir)}
function viewSongFromList(id){const l=lists.find(x=>x.id===viewingListId);if(l){listNavIndex=l.songIds.indexOf(id);if(listNavIndex===-1)listNavIndex=0}viewingSongId=id;viewReturnTo='listview';showPage('view')}
function repSongNav(dir){const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;const songsForDay=r.canciones.filter(s=>s.dia==='ambos'||s.dia===repDay).sort((a,b)=>a.orden-b.orden);const newIdx=repSongNavIndex+dir;if(newIdx>=0&&newIdx<songsForDay.length){stopAllAudio();repSongNavIndex=newIdx;viewingRepSongId=songsForDay[newIdx].id;repShowChords=true;showPage('rep-song')}}
function addMissingToList(listId,songId){const id=genId();songs.push({id,title:'Canción importada',artist:'Desconocido',lyrics:'',originalKey:'C',currentKey:'C',tags:['importada'],createdAt:Date.now(),updatedAt:Date.now()});const l=lists.find(x=>x.id===listId);if(l){l.songIds=l.songIds.map(sid=>sid===songId?id:sid)}save('cb_songs',songs);save('cb_lists',lists);renderListView()}
function removeFromList(sid){const l=lists.find(x=>x.id===viewingListId);if(!l)return;l.songIds=l.songIds.filter(id=>id!==sid);save('cb_lists',lists);renderListView()}

function toggleListPicker(){document.getElementById('view-list-picker').classList.toggle('hidden');renderListPicker()}
function renderListPicker(){const s=songs.find(x=>x.id===viewingSongId);if(!s)return;const p=document.getElementById('view-list-picker');if(lists.length===0){p.innerHTML='<div class="list-picker-title">No hay listas creadas</div>';return}p.innerHTML='<div class="list-picker-title">Añadir a lista:</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+lists.map(l=>{const isIn=l.songIds.includes(s.id);return'<button class="list-chip '+(isIn?'in':'out')+'" onclick="toggleSongInList(\''+l.id+'\')">'+(isIn?'✓ ':'')+esc(l.name)+'</button>'}).join('')+'</div>'}
function toggleSongInList(lid){const l=lists.find(x=>x.id===lid),s=songs.find(x=>x.id===viewingSongId);if(!l||!s)return;if(l.songIds.includes(s.id)){l.songIds=l.songIds.filter(id=>id!==s.id)}else{l.songIds.push(s.id)}save('cb_lists',lists);renderListPicker();renderView()}

document.getElementById('search-input').addEventListener('input',renderLibrary);

const MONTH_NAMES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_NAMES=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
function fmtDate(ds){const d=new Date(ds+'T12:00:00');return DAY_NAMES[d.getDay()]+' '+d.getDate()+'/'+MONTH_NAMES[d.getMonth()]}
function fmtShortDate(ds){const d=new Date(ds+'T12:00:00');return d.getDate()+' '+MONTH_NAMES[d.getMonth()].slice(0,3)}

function showRepLogin(){document.getElementById('login-modal').classList.remove('hidden');document.getElementById('login-password').focus()}
function hideRepLogin(){document.getElementById('login-modal').classList.add('hidden');document.getElementById('login-password').value='';document.getElementById('login-error').classList.add('hidden')}
function doRepLogin(){if(document.getElementById('login-password').value==='worship2026'){repAdmin=true;hideRepLogin();renderRepertorios()}else{document.getElementById('login-error').classList.remove('hidden');setTimeout(()=>document.getElementById('login-error').classList.add('hidden'),3000)}}

async function createRepertorio(){
  if(!repAdmin||!supabaseReady)return;
  const titulo=prompt('Nombre del repertorio (ej: 24/25 Agosto):');if(!titulo)return;
  const fecha=prompt('Fecha del domingo (YYYY-MM-DD):','2026-08-24');if(!fecha)return;
  const d=new Date(fecha+'T12:00:00');
  const dom=d.toISOString().split('T')[0];
  const lun=new Date(d.getTime()+86400000).toISOString().split('T')[0];
  const id='r'+Date.now().toString(36);
  try{
    const {error}=await supabaseClient.from('repertorios').insert({id,titulo,fecha_domingo:dom,fecha_lunes:lun,mes:d.getMonth()+1,año:d.getFullYear(),estado:'activo',created_at:Date.now()});
    if(error)throw error;
    await loadRepertorios();renderRepertorios();alert('Repertorio creado');
  }catch(e){alert('Error: '+e.message)}
}

async function addSongToRepertorio(repId,defaultDia){
  if(!canManageReps()||!supabaseReady)return;
  if(songs.length===0){alert('No hay canciones en tu biblioteca');return}
  // Store default dia for later use
  addSongDefaultDia=defaultDia||'ambos';
  // Flag: if defaultDia is 'ambos', skip vocal editor and add directly
  addSongDirectMode=(addSongDefaultDia==='ambos');
  const picker=document.getElementById('rep-song-picker');if(!picker)return;
  picker.classList.remove('hidden');
  picker.innerHTML='<div style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:flex-end;justify-content:center" onclick="if(event.target===this)this.classList.add(\'hidden\')"><div style="background:#27272a;border-radius:16px 16px 0 0;width:100%;max-width:500px;max-height:calc(100vh - 20px);overflow-y:auto;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))"><h3 style="font-size:1rem;font-weight:700;color:#fff;margin-bottom:12px">Seleccionar canción</h3><input type="text" id="rep-picker-search" class="input" placeholder="Buscar canción..." style="margin-bottom:10px" oninput="filterRepPicker()"><div id="rep-song-picker-list"></div></div></div>';
  const list=document.getElementById('rep-song-picker-list');
  list.innerHTML=songs.map(s=>'<div class="card" style="margin-bottom:8px;padding:10px" onclick="confirmAddSongToRep(\''+repId+'\',\''+s.id+'\')"><div style="font-weight:600;color:#fff;font-size:.85rem">'+esc(s.title)+'</div><div style="font-size:.75rem;color:#a1a1aa">'+esc(s.artist)+'</div>'+(s.audio_url?'<span style="font-size:.65rem;color:#4ade80">🎵 Audio vinculado</span>':'')+'</div>').join('');
}

function filterRepPicker(){
  const q=(document.getElementById('rep-picker-search').value||'').toLowerCase();
  const list=document.getElementById('rep-song-picker-list');
  if(!list)return;
  const filtered=q?songs.filter(s=>s.title.toLowerCase().includes(q)||s.artist.toLowerCase().includes(q)):songs;
  list.innerHTML=filtered.map(s=>'<div class="card" style="margin-bottom:8px;padding:10px" onclick="confirmAddSongToRep(\''+(viewingRepId||'')+'\',\''+s.id+'\')"><div style="font-weight:600;color:#fff;font-size:.85rem">'+esc(s.title)+'</div><div style="font-size:.75rem;color:#a1a1aa">'+esc(s.artist)+'</div>'+(s.audio_url?'<span style="font-size:.65rem;color:#4ade80">🎵 Audio vinculado</span>':'')+'</div>').join('');
  if(filtered.length===0)list.innerHTML='<div style="text-align:center;padding:20px;color:#71717a;font-size:.8rem">No se encontraron canciones</div>';
}

async function confirmAddSongToRep(repId,songId){
  const s=songs.find(x=>x.id===songId);const r=repertorios.find(x=>x.id===repId);
  if(!s||!r)return;
  document.getElementById('rep-song-picker').innerHTML='';
  
  // Direct mode: add to "ambos" without vocal editor
  if(addSongDirectMode){
    const orden=r.canciones.length+1;
    const id='rs'+Date.now().toString(36);
    // Use saved vocals from local song, or defaults
    const localSong=songs.find(x=>x.id===songId);
    const vocalDom=localSong?(localSong.vocalista_domingo||''):'';
    const vocalLun=localSong?(localSong.vocalista_lunes||''):'';
    const corosDom=localSong?(localSong.coros_domingo||[]):[];
    const corosLun=localSong?(localSong.coros_lunes||[]):[];
    try{
      const {error}=await supabaseClient.from('canciones_repertorio').insert({
        id,
        repertorio_id:repId,
        titulo:s.title,
        artista:s.artist,
        dia:'ambos',
        orden,
        tono_original:s.originalKey,
        tempo:s.tempo||0,
        compas:s.compas||'',
        duracion:'0:00',
        vocalista_domingo:vocalDom,
        vocalista_lunes:vocalLun,
        coros_domingo:corosDom,
        coros_lunes:corosLun,
        letra_acordes:s.lyrics,
        audio_url:s.audio_url||null,
        source_song_id:s.id,
        created_at:Date.now()
      });
      if(error)throw error;
      await loadRepertorios();
      renderRepertorios();
      showNotification('"'+s.title+'" agregada a ambos días','success');
    }catch(e){alert('Error al guardar: '+e.message)}
    return;
  }
  
  // Modal mode: open vocal editor for specific day
  const ctxDay=addSongDefaultDia!=='ambos'?addSongDefaultDia:(repDay||'domingo');
  vocalEditorDay=addSongDefaultDia;
  showVocalEditor(repId,songId,'add',s,ctxDay);
}

async function deleteRepertorio(repId){
  if(!canManageReps()||!supabaseReady)return;
  if(!confirm('¿Eliminar este repertorio y todas sus canciones?'))return;
  try{await supabaseClient.from('canciones_repertorio').delete().eq('repertorio_id',repId);await supabaseClient.from('repertorios').delete().eq('id',repId);await loadRepertorios();renderRepertorios();}catch(e){alert('Error: '+e.message)}
}

function switchRepTab(tab){repTab=tab;document.getElementById('rep-tab-active').className='rep-tab '+(tab==='active'?'active':'');document.getElementById('rep-tab-history').className='rep-tab '+(tab==='history'?'active':'');renderRepertorios()}

function renderRepertorios(){
  const active = repertorios.filter(r => r.estado === 'activo').sort((a, b) => a.fecha_domingo > b.fecha_domingo ? 1 : a.fecha_domingo < b.fecha_domingo ? -1 : 0);
  const archived=repertorios.filter(r=>r.estado==='archivado');
  document.getElementById('rep-count').textContent=active.length+' activos';
  document.getElementById('rep-admin-btn').innerHTML=repAdmin?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Gestionar':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Admin';
  document.getElementById('rep-admin-btn').style.display=repAdmin?'none':'';
  const c=document.getElementById('rep-list');
  if(repTab==='active'){
    const fc=document.getElementById('rep-filters');
    if(repAdmin){fc.style.display='block';fc.innerHTML='<button class="btn btn-amber" style="width:100%;margin-bottom:8px" onclick="createRepertorio()">+ Crear repertorio</button>';}else{fc.style.display='none'}
    if(active.length===0){c.innerHTML='<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><h2>No hay repertorios activos</h2><p>'+(repAdmin?'Crea uno desde el botón de gestionar':'Espera a que el admin cree uno')+'</p></div>';return}
    c.innerHTML=active.map(r=>{const sc=r.canciones.length;const vocs=[...new Set(r.canciones.map(c=>(c.vocalista_domingo||'')).filter(Boolean))];return '<div class="rep-card" onclick="viewRepertorio(\''+r.id+'\')"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1"><div class="rep-card-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> '+fmtDate(r.fecha_domingo)+' | '+fmtDate(r.fecha_lunes)+'</div><div class="rep-card-meta"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> '+sc+' canciones</span>'+(vocs.length>0?'<span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> '+vocs.join(', ')+'</span>':'')+'</div>'+(sc===0?'<p style="font-size:.7rem;color:#71717a;margin-top:6px;font-style:italic">Aún sin canciones asignadas</p>':'')+'</div>'+(canManageReps()?'<div style="display:flex;gap:4px;flex-shrink:0"><button class="btn-icon" onclick="event.stopPropagation();addSongToRepertorio(\''+r.id+'\')" title="Agregar canción" style="color:#f59e0b"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button><button class="btn-icon btn-icon-red" onclick="event.stopPropagation();deleteRepertorio(\''+r.id+'\')" title="Eliminar" style="color:#f87171"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>':'')+'</div></div>';}).join('');
  }else{
    const uniqueYears=[...new Set(archived.map(r=>r.año))].sort((a,b)=>b-a);
    let filtered=archived;
    if(repHistoryMonth)filtered=filtered.filter(r=>r.mes==repHistoryMonth);
    if(repHistoryYear)filtered=filtered.filter(r=>r.año==repHistoryYear);
    filtered.sort((a,b)=>b.fecha_domingo>a.fecha_domingo?1:b.fecha_domingo<a.fecha_domingo?-1:0);
    const fc=document.getElementById('rep-filters');
    fc.style.display='flex';
    fc.innerHTML='<select class="input" style="flex:1;padding:6px 8px;font-size:.75rem" onchange="repHistoryMonth=this.value;renderRepertorios()"><option value="">Todos los meses</option>'+MONTH_NAMES.map((n,i)=>'<option value="'+(i+1)+'"'+(repHistoryMonth==i+1?' selected':'')+'>'+n+'</option>').join('')+'</select><select class="input" style="flex:1;padding:6px 8px;font-size:.75rem" onchange="repHistoryYear=this.value;renderRepertorios()"><option value="">Todos los años</option>'+uniqueYears.map(y=>'<option value="'+y+'"'+(repHistoryYear==y?' selected':'')+'>'+y+'</option>').join('')+'</select>'+(repHistoryMonth||repHistoryYear?'<button class="btn btn-zinc btn-sm" onclick="repHistoryMonth=\'\';repHistoryYear=\'\';renderRepertorios()">Limpiar</button>':'');
    if(filtered.length===0){c.innerHTML='<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/></svg></div><h2>No hay repertorios en el historial</h2></div>';return}
    c.innerHTML=filtered.map(r=>{const sc=r.canciones.length;return '<div class="rep-card" onclick="viewRepertorio(\''+r.id+'\')" style="opacity:.8"><div class="rep-card-title" style="color:#a1a1aa"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2"><polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/></svg> '+fmtDate(r.fecha_domingo)+' | '+fmtDate(r.fecha_lunes)+'</div><span style="font-size:.7rem;color:#71717a">'+sc+' canciones</span></div>';}).join('');
  }
}

function viewRepertorio(id){viewingRepId=id;var savedDay=load('cb_rep_day_'+id,null);repDay=savedDay||'domingo';document.getElementById('rep-day-dom').className='rep-tab '+(repDay==='domingo'?'active':'');document.getElementById('rep-day-lun').className='rep-tab '+(repDay==='lunes'?'active':'');showPage('repertorio')}
function switchRepDay(day){repDay=day;save('cb_rep_day_'+viewingRepId,day);document.getElementById('rep-day-dom').className='rep-tab '+(day==='domingo'?'active':'');document.getElementById('rep-day-lun').className='rep-tab '+(day==='lunes'?'active':'');renderRepertorioView()}

// Save dirige name for a specific day
function saveDirige(repId,day,name){
  if(!supabaseReady)return;
  var field=day==='domingo'?'dirige_domingo':'dirige_lunes';
  var updateObj={};updateObj[field]=name;
  supabaseClient.from('repertorios').update(updateObj).eq('id',repId).then(function(result){
    if(result.error){console.error('Save dirige error:',result.error);return}
    // Update local cache
    var r=repertorios.find(x=>x.id===repId);
    if(r)r[field]=name;
    showNotification('Dirige actualizado','success');
  }).catch(function(e){console.error('Save dirige error:',e)});
}

// Renumber songs in a repertorio after add/delete
async function renumberRepSongs(repId){
  const r=repertorios.find(x=>x.id===repId);
  if(!r||!r.canciones.length)return;
  // Sort by current order and renumber
  const sorted=[...r.canciones].sort((a,b)=>(a.orden||0)-(b.orden||0));
  for(let i=0;i<sorted.length;i++){
    const newOrder=i+1;
    if(sorted[i].orden!==newOrder){
      sorted[i].orden=newOrder;
      await supabaseClient.from('canciones_repertorio').update({orden:newOrder}).eq('id',sorted[i].id);
    }
  }
}
async function moveRepSong(repId, songId, direction) {
  if (!canManageReps() || !supabaseReady) return;
  const r = repertorios.find(x => x.id === repId);
  if (!r) return;
  const songsSorted = r.canciones.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const idx = songsSorted.findIndex(x => x.id === songId);
  if (idx < 0) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= songsSorted.length) return;
  const tmpOrden = songsSorted[idx].orden;
  songsSorted[idx].orden = songsSorted[targetIdx].orden;
  songsSorted[targetIdx].orden = tmpOrden;
  try {
    await supabaseClient.from('canciones_repertorio').update({orden: songsSorted[idx].orden}).eq('id', songsSorted[idx].id);
    await supabaseClient.from('canciones_repertorio').update({orden: songsSorted[targetIdx].orden}).eq('id', songsSorted[targetIdx].id);
    await loadRepertorios();
    renderRepertorioView();
  } catch (e) {
    alert('Error al mover: ' + e.message);
  }
}

// renderRepVocesView removed - chorus audio is now shown in rep-song view

function renderRepertorioView(){
  const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;
  document.getElementById('rep-view-header').innerHTML='<h1 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:4px">'+fmtDate(repDay==='domingo'?r.fecha_domingo:r.fecha_lunes)+'</h1><p style="font-size:.8rem;color:#71717a">'+fmtDate(repDay==='domingo'?r.fecha_lunes:r.fecha_domingo)+'</p>';
  const songsForDay=r.canciones.filter(s=>s.dia==='ambos'||s.dia===repDay).sort((a,b)=>a.orden-b.orden);
  const c=document.getElementById('rep-view-songs');
  // Build Dirige section
  var canEditDir=canEditVocals();
  var dirigeName=repDay==='domingo'?(r.dirige_domingo||''):(r.dirige_lunes||'');
  var dirigeField=canEditDir?'<input class="input" style="max-width:250px;padding:5px 8px;font-size:.85rem" value="'+esc(dirigeName)+'" placeholder="Nombre del dirige" onchange="saveDirige(\''+r.id+'\',\''+repDay+'\',this.value)"/>':'<span style="font-size:.9rem;color:#fbbf24;font-weight:600">'+(dirigeName?esc(dirigeName):'<span style="color:#52525b;font-weight:400;font-style:italic">Sin asignar</span>')+'</span>';
  var dirigeHtml='<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(39,39,42,.4);border:1px solid rgba(63,63,70,.4);border-radius:10px;margin-bottom:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span style="font-size:.8rem;color:#a1a1aa">Dirige:</span>'+dirigeField+'</div>';
  if(songsForDay.length===0){c.innerHTML=dirigeHtml+'<div class="empty"><div class="empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><h2>No hay canciones para este día</h2><p>'+(canManageReps()?'Agrega canciones con el botón de abajo':'El admin aún no ha asignado canciones')+'</p>'+(canManageReps()?'<button class="btn btn-amber" style="margin-top:10px" onclick="addSongToRepertorio(\''+r.id+'\',\''+repDay+'\')">+ Agregar canción</button>':'')+'</div>';return}
  c.innerHTML=dirigeHtml+songsForDay.map(s=>{
    var corosForDay=(repDay==='domingo'?(s.coros_domingo||[]):(s.coros_lunes||s.coros_domingo||[]));
    if(typeof corosForDay==='string')corosForDay=corosForDay?corosForDay.split(',').map(function(x){return x.trim()}).filter(Boolean):[];
    if(!Array.isArray(corosForDay))corosForDay=[];
    // Build numbered coros display
    const corosDisplay=corosForDay.length>0?corosForDay.map(function(c,i){return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px"><span style="width:14px;height:14px;background:rgba(245,158,11,.2);color:#fbbf24;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:700">'+(i+1)+'</span><span style="color:#a1a1aa;font-size:.7rem">'+esc(c)+'</span></span>'}).join(''):'';

    return '<div class="rep-song-card" onclick="viewRepSong(\''+r.id+'\',\''+s.id+'\')"><div class="rep-song-order">'+s.orden+'</div><div class="rep-song-info"><div class="rep-song-title">'+esc(s.titulo)+'</div><div class="rep-song-artist">'+esc(s.artista)+'</div><div class="rep-song-vocals"><span class="rep-vocal-main"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Principal: '+esc((repDay==='domingo'?(s.vocalista_domingo||'Por asignar'):(s.vocalista_lunes||s.vocalista_domingo||'Por asignar')))+'</span>'+(corosForDay.length>0?'<span class="rep-vocal-chorus" style="display:inline-flex;flex-wrap:wrap;align-items:center">'+corosDisplay+'</span>':'')+'</div><div class="rep-song-meta"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg> '+dn(s.tono_original)+'</span>'+(s.compas?'<span class="rep-meta-item">'+s.compas+'</span>':'')+(s.tempo?'<span class="rep-meta-item">'+s.tempo+' BPM</span>':'')+'</div>'+(s.dia!=='ambos'?'<span class="rep-day-badge '+(s.dia==='domingo'?'dom':'lun')+'">Solo '+(s.dia==='domingo'?'Domingo':'Lunes')+'</span>':'')+'</div>'+(canManageReps()?'<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;align-self:center"><button class="btn-icon" onclick="event.stopPropagation();moveRepSong(\''+r.id+'\',\''+s.id+'\',-1)" title="Subir" style="color:#71717a;font-size:.65rem;line-height:1">▲</button><button class="btn-icon" onclick="event.stopPropagation();moveRepSong(\''+r.id+'\',\''+s.id+'\',1)" title="Bajar" style="color:#71717a;font-size:.65rem;line-height:1">▼</button></div>':'')+(canEditVocals()?'<button class="btn-icon" onclick="event.stopPropagation();editRepVocals(\''+r.id+'\',\''+s.id+'\')" title="Editar vocales" style="color:#f59e0b;flex-shrink:0;align-self:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+(canManageReps()?'<button class="btn-icon btn-icon-red" onclick="event.stopPropagation();deleteRepSong(\''+r.id+'\',\''+s.id+'\')" title="Eliminar canción" style="flex-shrink:0;align-self:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>':'')+'</div>';
  }).join('')+(canManageReps()?'<div style="text-align:center;padding:16px 0"><button class="btn btn-amber" onclick="addSongToRepertorio(\''+r.id+'\',\''+repDay+'\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Agregar canción</button></div>':'');
}

function viewRepSong(rid,sid){stopAllAudio();viewingRepId=rid;viewingRepSongId=sid;repShowChords=true;const r=repertorios.find(x=>x.id===rid);if(r){const songsForDay=r.canciones.filter(s=>s.dia==='ambos'||s.dia===repDay).sort((a,b)=>a.orden-b.orden);const idx=songsForDay.findIndex(x=>x.id===sid);if(idx>=0)repSongNavIndex=idx}showPage('rep-song')}
function goBackFromRepSong(){stopAllAudio();showPage('repertorio')}
function setRepSongView(showChords){repShowChords=showChords;document.getElementById('toggle-lyrics').className=showChords?'inactive':'active';document.getElementById('toggle-chords').className=showChords?'active':'inactive';renderRepSongLyrics()}

function renderRepSongView(){
  const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;
  const s=r.canciones.find(x=>x.id===viewingRepSongId);if(!s)return;
  // Show nav bar for repertorio songs
  const nav=document.getElementById('rep-song-nav');
  const songsForDay=r.canciones.filter(x=>x.dia==='ambos'||x.dia===repDay).sort((a,b)=>a.orden-b.orden);
  if(songsForDay.length>1){
    nav.classList.remove('hidden');
    const curIdx=songsForDay.findIndex(x=>x.id===viewingRepSongId);
    if(curIdx>=0)repSongNavIndex=curIdx;
    document.getElementById('rep-song-nav-info').textContent=(repSongNavIndex+1)+' / '+songsForDay.length;
    document.getElementById('rep-song-prev-btn').disabled=repSongNavIndex<=0;
    document.getElementById('rep-song-next-btn').disabled=repSongNavIndex>=songsForDay.length-1;
  }else{nav.classList.add('hidden')}
  repCurrentKey=s.tono_original;
  var corosForDay=(repDay==='domingo'?(s.coros_domingo||[]):(s.coros_lunes||s.coros_domingo||[]));
  if(typeof corosForDay==='string')corosForDay=corosForDay?corosForDay.split(',').map(function(x){return x.trim()}).filter(Boolean):[];
  if(!Array.isArray(corosForDay))corosForDay=[];
  // Update save button state
  const saveBtn=document.getElementById('save-rep-btn');
  if(saveBtn){
    const already=songs.find(x=>x.title===s.titulo&&x.artist===s.artista);
    if(already){saveBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Guardada';saveBtn.style.background='rgba(34,197,94,.2)';saveBtn.style.color='#4ade80';saveBtn.style.borderColor='rgba(34,197,94,.3)';saveBtn.disabled=true}
    else{saveBtn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Guardar';saveBtn.style.background='rgba(39,39,46,.8)';saveBtn.style.color='#a1a1aa';saveBtn.style.borderColor='rgba(63,63,70,.5)';saveBtn.disabled=false}
  }
  // Update notation toggle
  const ntBtn=document.getElementById('notation-toggle');
  if(ntBtn)ntBtn.innerHTML=useFlats?'♭':'#';
  // Day display above song title
  const dayName=repDay==='domingo'?'Domingo':'Lunes';
  const dayColor=repDay==='domingo'?'#60a5fa':'#c084fc';
  const dayEmoji=repDay==='domingo'?'🌞':'🌙';
  document.getElementById('rep-song-info').innerHTML='<div style="text-align:center;margin-bottom:8px"><span style="font-size:.85rem;font-weight:700;color:'+dayColor+';display:inline-flex;align-items:center;gap:4px;padding:4px 14px;background:'+(repDay==='domingo'?'rgba(59,130,246,.15)':'rgba(168,85,247,.15)')+';border:1px solid '+(repDay==='domingo'?'rgba(59,130,246,.3)':'rgba(168,85,247,.3)')+';border-radius:8px">'+dayEmoji+' '+dayName+'</span></div><h1 style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:2px">'+esc(s.titulo)+'</h1><p style="font-size:.8rem;color:#a1a1aa;margin-bottom:6px">'+esc(s.artista)+'</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><span style="font-size:.75rem;color:#fbbf24;display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Principal: '+esc(repDay==='domingo'?(s.vocalista_domingo||'Por asignar'):(s.vocalista_lunes||s.vocalista_domingo||'Por asignar'))+'</span>'+(corosForDay.length>0?'<span style="font-size:.7rem;color:#a1a1aa;display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px">'+corosForDay.map(function(c,i){return '<span style="display:inline-flex;align-items:center;gap:2px"><span style="width:14px;height:14px;background:rgba(245,158,11,.2);color:#fbbf24;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:.55rem;font-weight:700">'+(i+1)+'</span><span>'+esc(c)+'</span></span>'}).join('')+'</span>':'')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="rep-meta-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg> '+dn(s.tono_original)+'</span>'+(s.compas?'<span class="rep-meta-item">'+s.compas+'</span>':'')+(s.tempo?'<span class="rep-meta-item">'+s.tempo+' BPM</span>':'')+'</div>';
  document.getElementById('rep-song-key').innerHTML='<button class="key-btn" onclick="changeRepKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button><button id="notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">'+(useFlats?'\u266D':'#')+'</button><div class="key-display"><div class="key-note">'+dn(repCurrentKey)+'</div>'+(repCurrentKey!==s.tono_original?'<button class="key-original" onclick="resetRepKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: '+dn(s.tono_original)+'</button>':'')+'</div><button class="key-btn" onclick="changeRepKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>';
  // Build vocal audios section - 2 columns: Domingo and Lunes
  let vocalAudiosHtml='';
  if(r&&r.vocalAudios){
    const sourceSongId=s.source_song_id||viewingRepSongId;
    const songAudios=r.vocalAudios.filter(va=>(va.source_song_id||va.cancion_repertorio_id)===sourceSongId);
    const corosDom=Array.isArray(s.coros_domingo)?s.coros_domingo:[];
    const corosLun=Array.isArray(s.coros_lunes)?s.coros_lunes:[];
    const domAudios=songAudios.filter(va=>va.dia==='domingo');
    const lunAudios=songAudios.filter(va=>va.dia==='lunes');
    const hasAnyAudio=domAudios.some(a=>a.audio_url)||lunAudios.some(a=>a.audio_url);
    if(hasAnyAudio||corosDom.length>0||corosLun.length>0){
      vocalAudiosHtml='<div style="display:flex;flex-direction:column;gap:10px">';
      // DOMINGO COLUMN (only when repDay==='domingo')
      if(repDay==='domingo'){
      vocalAudiosHtml+='<div style="background:rgba(27,27,30,.4);border:1px solid rgba(245,158,11,.2);border-radius:10px;padding:10px">';
      vocalAudiosHtml+='<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px"><span style="font-size:.75rem;font-weight:600;color:#fbbf24">🌞 Domingo</span>';
      if(s.vocalista_domingo)vocalAudiosHtml+='<span style="font-size:.6rem;color:#71717a">· Principal: '+esc(s.vocalista_domingo)+'</span>';
      vocalAudiosHtml+='</div>';
      vocalAudiosHtml+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
      for(let coro=1;coro<=4;coro++){
        const audio=domAudios.find(va=>va.coro_number===coro);
        const coroName=corosDom[coro-1]||'';
        const audioKey=viewingRepId+'_'+viewingRepSongId+'_domingo_'+coro;
        vocalAudiosHtml+='<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;background:rgba(245,158,11,.05);border-radius:6px;margin-bottom:3px;border:1px solid rgba(63,63,70,.2)">';
        vocalAudiosHtml+='<span style="min-width:18px;font-size:.6rem;color:#fbbf24;font-weight:700;background:rgba(245,158,11,.15);padding:1px 4px;border-radius:3px;text-align:center">'+coro+'</span>';
        if(audio&&audio.audio_url){vocalAudiosHtml+='<button class="btn-icon" data-vocal-key="'+audioKey+'" onclick="playVocalAudio(\''+audioKey+'\',\''+audio.audio_url+'\')" style="color:#4ade80;padding:2px" title="Reproducir"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';}
        vocalAudiosHtml+='<div style="flex:1;min-width:0;font-size:.65rem;color:'+(coroName?'#d4d4d8':'#52525b')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(coroName?esc(coroName):(audio&&audio.audio_url?'Audio':'—'))+'</div>';
        vocalAudiosHtml+='</div>';
      }
      vocalAudiosHtml+='</div>'; // close grid
      vocalAudiosHtml+='</div>';
      } // end if domingo
      // LUNES COLUMN (only when repDay==='lunes')
      if(repDay==='lunes'){
      vocalAudiosHtml+='<div style="background:rgba(27,27,30,.4);border:1px solid rgba(192,132,252,.2);border-radius:10px;padding:10px">';
      vocalAudiosHtml+='<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px"><span style="font-size:.75rem;font-weight:600;color:#c084fc">🌙 Lunes</span>';
      if(s.vocalista_lunes)vocalAudiosHtml+='<span style="font-size:.6rem;color:#71717a">· Principal: '+esc(s.vocalista_lunes)+'</span>';
      vocalAudiosHtml+='</div>';
      vocalAudiosHtml+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
      for(let coro=1;coro<=4;coro++){
        const audio=lunAudios.find(va=>va.coro_number===coro);
        const coroName=corosLun[coro-1]||'';
        const audioKey=viewingRepId+'_'+viewingRepSongId+'_lunes_'+coro;
        vocalAudiosHtml+='<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;background:rgba(192,132,252,.05);border-radius:6px;margin-bottom:3px;border:1px solid rgba(63,63,70,.2)">';
        vocalAudiosHtml+='<span style="min-width:18px;font-size:.6rem;color:#c084fc;font-weight:700;background:rgba(192,132,252,.15);padding:1px 4px;border-radius:3px;text-align:center">'+coro+'</span>';
        if(audio&&audio.audio_url){vocalAudiosHtml+='<button class="btn-icon" data-vocal-key="'+audioKey+'" onclick="playVocalAudio(\''+audioKey+'\',\''+audio.audio_url+'\')" style="color:#4ade80;padding:2px" title="Reproducir"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';}
        vocalAudiosHtml+='<div style="flex:1;min-width:0;font-size:.65rem;color:'+(coroName?'#d4d4d8':'#52525b')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(coroName?esc(coroName):(audio&&audio.audio_url?'Audio':'—'))+'</div>';
        vocalAudiosHtml+='</div>';
      }
      vocalAudiosHtml+='</div>'; // close grid
      vocalAudiosHtml+='</div>';
      } // end if lunes
      vocalAudiosHtml+='</div>';
    }
  }
  
  document.getElementById('rep-song-audio').innerHTML=(s.audio_url?'<div class="audio-player" id="rep-audio-player"><button class="audio-play-btn" onclick="toggleRepAudio()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekRepAudio(event)" ontouchmove="seekRepAudioTouch(event)"><div class="audio-bar-fill" id="rep-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="rep-audio-current">0:00</span><span id="rep-audio-duration">--:--</span></div></div></div>':'<div style="background:rgba(39,39,42,.3);border:1px solid rgba(63,63,70,.3);border-radius:12px;padding:16px;text-align:center;margin-bottom:12px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="2" style="margin:0 auto 8px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><p style="font-size:.8rem;color:#71717a">Audio no disponible</p></div>')+(vocalAudiosHtml?'<div style="margin-top:16px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span style="font-size:.85rem;font-weight:600;color:#fbbf24">Audios de voces</span></div>'+vocalAudiosHtml+'<div id="vocal-audio-player-bar" class="audio-player" style="display:none;margin-top:10px"><button class="audio-play-btn" onclick="toggleVocalAudioFromBar()" style="width:36px;height:36px"><svg width="16" height="16" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg></button><div class="audio-progress"><div class="audio-bar" onclick="seekVocalAudio(event)" ontouchmove="seekVocalAudioTouch(event)"><div class="audio-bar-fill" id="vocal-audio-fill" style="width:0%"></div></div><div class="audio-time"><span id="vocal-audio-current">0:00</span><span id="vocal-audio-duration">--:--</span></div></div></div></div>':'');
  document.getElementById('toggle-lyrics').className=repShowChords?'inactive':'active';
  document.getElementById('toggle-chords').className=repShowChords?'active':'inactive';
  // Admin actions
  const adminActions=document.getElementById('rep-song-admin-actions');
  if(adminActions){
    if(canManageReps()){
      adminActions.innerHTML='<button class="btn btn-sm" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);gap:4px;margin-left:4px" onclick="deleteRepSong(\''+viewingRepId+'\',\''+viewingRepSongId+'\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Eliminar</button>';
    }else{
      adminActions.innerHTML='';
    }
  }
  renderRepSongLyrics();
}
function deleteRepSong(repId,songId){
  if(!canManageReps()||!supabaseReady)return;
  const r=repertorios.find(x=>x.id===repId);
  if(!r)return;
  const s=r.canciones.find(x=>x.id===songId);
  if(!s)return;
  if(!confirm('¿Eliminar "'+s.titulo+'" de este repertorio?'))return;
  // NOTE: Vocal audios are NOT deleted here - they persist by source_song_id
  // They are only deleted when the user explicitly deletes a vocal audio from the "asignar voces" view
  supabaseClient.from('canciones_repertorio').delete().eq('id',songId).then(async function(result){
    if(result.error){alert('Error: '+result.error.message);return}
    await loadRepertorios();
    await renumberRepSongs(repId);
    await loadRepertorios();
    if(viewingRepId===repId&&viewingRepSongId===songId){
      showPage('repertorio');
    }else{
      renderRepertorioView();
    }
  }).catch(function(e){alert('Error: '+e.message)});
}
function changeRepKey(d){const r=repertorios.find(x=>x.id===viewingRepId);const s=r?.canciones.find(x=>x.id===viewingRepSongId);if(!s)return;const currentIdx=NOTE_MAP[repCurrentKey]??0;const newIdx=(currentIdx+d+12)%12;repCurrentKey=useFlats?FLATS[newIdx]:SHARPS[newIdx];document.getElementById('rep-song-key').innerHTML='<button class="key-btn" onclick="changeRepKey(-1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg></button><button id="notation-toggle" onclick="toggleNotation()" class="key-btn" style="font-size:.85rem;font-family:monospace;color:#fbbf24" title="Alternar entre \u266D y #">'+(useFlats?'\u266D':'#')+'</button><div class="key-display"><div class="key-note">'+dn(repCurrentKey)+'</div>'+(repCurrentKey!==s.tono_original?'<button class="key-original" onclick="resetRepKey()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Original: '+dn(s.tono_original)+'</button>':'')+'</div><button class="key-btn" onclick="changeRepKey(1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg></button>';renderRepSongLyrics()}
function resetRepKey(){const r=repertorios.find(x=>x.id===viewingRepId);const s=r?.canciones.find(x=>x.id===viewingRepSongId);if(!s)return;repCurrentKey=s.tono_original;changeRepKey(0)}
async function renderRepSongLyrics(){
  const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;
  const s=r.canciones.find(x=>x.id===viewingRepSongId);if(!s)return;
  const semi=getS(s.tono_original,repCurrentKey);
  const c=document.getElementById('rep-song-lyrics');
  if(repShowChords){c.innerHTML=s.letra_acordes.split('\n').map(line=>{const t=semi!==0?transposeLine(line,semi):line;if(/\[[^\]]+\]/.test(t)){let h='<div class="lyrics-line">'+t.replace(/\[([^\]]+)\]/g,(m,p1)=>'<span class="chord">'+displayChord(p1)+'</span>');h=h.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');h=h.replace(/\s*\{\d+\}/g,'');return h+'</div>'}if(/\([^)]+\)/.test(line)){var _dl=line.replace(/\s*\{\d+\}/g,'');return'<div class="lyrics-line">'+_dl.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>')+'</div>'}return'<div class="lyrics-line">'+(line||'&nbsp;')+'</div>'}).join('')+getSongNoteHtml(s)}
  else{var lyricsHtml='';var srcId=s.source_song_id||viewingRepSongId;var sectionNotes={};if(srcId){sectionNotes=await loadSectionNotes(srcId,repDay)}s.letra_acordes.split('\n').forEach(function(line){var t2=semi!==0?transposeLine(line,semi):line;if(/\[[^\]]+\]/.test(t2)){var stripped=t2.replace(/\s*\[[^\]]+\]\s*/g,' ').trim();var h2='<div class="lyrics-line">';if(/\(([^)]+)\)/.test(t2)){var secMatch=t2.match(/\(([^)]+)\)/);var secName=secMatch?secMatch[1]:'';var idMatch=t2.match(/\)\s*\{(\d+)\}/);var secId=idMatch?idMatch[1]:'';var noteKey=secId?secName+'_'+secId:secName;var noteVal=(sectionNotes[noteKey]||'').replace(/"/g,'&quot;');var displayLine=stripped.replace(/\s*\{\d+\}/g,'');h2+=displayLine.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');if(srcId&&canEditVocals()){h2+='<span class="section-note-wrap"><input class="section-note-input" value="'+noteVal+'" placeholder="nota..." oninput="onSectionNoteInput(\''+srcId+'\',\''+repDay+'\',\''+noteKey.replace(/'/g,"\\'")+'\',this)"><span class="section-note-status"></span></span>'}else if(sectionNotes[noteKey]){h2+='<span class="section-note-display">'+esc(sectionNotes[noteKey])+'</span>'}}lyricsHtml+=h2+'</div>'}else if(/\(([^)]+)\)/.test(t2)){var secMatch2=t2.match(/\(([^)]+)\)/);var secName2=secMatch2?secMatch2[1]:'';var idMatch2=t2.match(/\)\s*\{(\d+)\}/);var secId2=idMatch2?idMatch2[1]:'';var noteKey2=secId2?secName2+'_'+secId2:secName2;var noteVal2=(sectionNotes[noteKey2]||'').replace(/"/g,'&quot;');var displayLine2=t2.replace(/\s*\{\d+\}/g,'');var h3='<div class="lyrics-line">'+displayLine2.replace(/\(([^)]+)\)/g,'<span class="lyrics-section">$1</span>');if(srcId&&canEditVocals()){h3+='<span class="section-note-wrap"><input class="section-note-input" value="'+noteVal2+'" placeholder="nota..." oninput="onSectionNoteInput(\''+srcId+'\',\''+repDay+'\',\''+noteKey2.replace(/'/g,"\\'")+'\',this)"><span class="section-note-status"></span></span>'}else if(sectionNotes[noteKey2]){h3+='<span class="section-note-display">'+esc(sectionNotes[noteKey2])+'</span>'}lyricsHtml+=h3+'</div>'}else{lyricsHtml+='<div class="lyrics-line">'+(t2||'&nbsp;')+'</div>'}});lyricsHtml+=getSongNoteHtml(s);c.innerHTML=lyricsHtml}}
let repAudioEl=null;let repAudioPlaying=false;let repAudioInterval=null;
function toggleRepAudio(){const r=repertorios.find(x=>x.id===viewingRepId);if(!r)return;const s=r.canciones.find(x=>x.id===viewingRepSongId);if(!s||!s.audio_url)return;const audioUrl=normalizeVocalAudioUrl(s.audio_url);if(!repAudioEl){repAudioEl=new Audio();repAudioEl.crossOrigin='anonymous';repAudioEl.preload='auto';repAudioEl.src=audioUrl;repAudioEl.addEventListener('ended',()=>{repAudioPlaying=false;updateAudioBtn()});repAudioEl.addEventListener('loadedmetadata',()=>{const dur=document.getElementById('rep-audio-duration');if(dur)dur.textContent=formatTime(repAudioEl.duration)});repAudioEl.addEventListener('error',()=>{console.error('Rep audio error, URL:',audioUrl);if(s.id){const r2Url=R2_WORKER_URL+'/file/songs/'+s.id+'.mp3';repAudioEl.src=r2Url;}else{alert('Error al cargar el audio');repAudioPlaying=false;updateAudioBtn()}})}if(repAudioPlaying){repAudioEl.pause();repAudioPlaying=false}else{repAudioEl.play().catch(e=>{console.error('Audio play error:',e)});repAudioPlaying=true}updateAudioBtn()}
function updateAudioBtn(){const btn=document.querySelector('.audio-play-btn');if(!btn)return;btn.innerHTML=repAudioPlaying?'<svg width="18" height="18" viewBox="0 0 24 24" fill="#000" stroke="#000" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5"><polygon points="5,3 19,12 5,21"/></svg>';if(repAudioPlaying){startAudioProgress()}else{stopAudioProgress()}}
function startAudioProgress(){stopAudioProgress();repAudioInterval=setInterval(()=>{if(!repAudioEl)return;const pct=repAudioEl.duration?(repAudioEl.currentTime/repAudioEl.duration)*100:0;const fill=document.getElementById('rep-audio-fill');if(fill)fill.style.width=pct+'%';const cur=document.getElementById('rep-audio-current');if(cur)cur.textContent=formatTime(repAudioEl.currentTime);},250)}
function stopAudioProgress(){if(repAudioInterval){clearInterval(repAudioInterval);repAudioInterval=null}}

// ============= AUDIO SEEKING =============
function seekAudio(audioEl,e){
  if(!audioEl||!audioEl.duration)return;
  var bar=e.currentTarget;
  var rect=bar.getBoundingClientRect();
  var pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  audioEl.currentTime=pct*audioEl.duration;
}
function seekViewAudio(e){seekAudio(viewAudioEl,e)}
function seekRepAudio(e){seekAudio(repAudioEl,e)}
// Touch support for seeking
function seekAudioTouch(audioEl,e){
  if(!audioEl||!audioEl.duration)return;
  var bar=e.currentTarget;
  var rect=bar.getBoundingClientRect();
  var touch=e.touches[0];
  var pct=Math.max(0,Math.min(1,(touch.clientX-rect.left)/rect.width));
  audioEl.currentTime=pct*audioEl.duration;
}
function seekViewAudioTouch(e){seekAudioTouch(viewAudioEl,e)}
function seekRepAudioTouch(e){seekAudioTouch(repAudioEl,e)}

// ============= AUDIO UPLOAD (IMPROVED) =============
let audioUploadSongId=null;
function triggerAudioUpload(songId){audioUploadSongId=songId;document.getElementById('audio-upload-input').click()}

// Remove audio from song (without deleting the song)
async function removeSongAudio(songId){
  if(!confirm('¿Eliminar el audio vinculado a esta canción?')){return}
  const si=songs.findIndex(s=>s.id===songId);
  if(si===-1){return}
  const s=songs[si];
  
  // Delete ALL audio variants from R2 for this song ID
  const extensions=['mp3','wav','ogg','m4a','aac','flac','webm'];
  for(const ext of extensions){
    try{
      await fetch(R2_WORKER_URL+'/file/songs/'+songId+'.'+ext,{method:'DELETE'});
    }catch(e){}
  }
  // Also delete from current audio_url
  if(s.audio_url){
    try{
      await fetch(R2_WORKER_URL+'/file/'+extractR2Key(s.audio_url),{method:'DELETE'});
    }catch(e){}
  }
  
  // Clear audio_url locally
  songs[si].audio_url=null;
  save('cb_songs',songs);
  
  // Update ALL references by source_song_id in Supabase
  try{
    await supabaseClient.from('canciones_repertorio').update({audio_url:null}).eq('source_song_id',songId);
    // Also update user_songs (FIXED: added .limit(10000))
    const {data:userSongs}=await supabaseClient.from('user_songs').select('id,song_data').limit(10000);
    if(userSongs){
      for(const us of userSongs){
        try{
          const sd=JSON.parse(us.song_data);
          if(sd.id===songId||(sd.sourceId&&sd.sourceId===songId)){
            sd.audio_url=null;
            await supabaseClient.from('user_songs')
              .update({song_data:JSON.stringify(sd),updated_at:Date.now()})
              .eq('id',us.id);
          }
        }catch(parseErr){}
      }
    }
  }catch(e){console.log('Supabase update skipped:',e.message)}
  
  // Reload repertorios so Historial reflects the removal
  try{await loadRepertorios()}catch(e){console.log("Reload repertorios error:",e.message)}
  // Re-render
  if(viewingSongId===songId){renderView()}
  else{renderLibrary()}
  
  // Also re-render repertorio view if it is currently open
  if(viewingRepId){renderRepertorioView()}
  showNotif('import-notification','Audio desvinculado de "'+s.title+'"','success');
}

// ============= VOCAL AUDIO SYSTEM =============
let vocalAudioUploadCoro=null;
let vocalAudioUploadRepId=null;
let vocalAudioUploadSongId=null;
let vocalAudioUploadSourceSongId=null;
let vocalAudioUploadDia='domingo'; // Day for this audio upload

function triggerVocalAudioUpload(repId,songId,coro,sourceSongId,dia){
  if(!canEditVocals())return;
  vocalAudioUploadRepId=repId;
  vocalAudioUploadSongId=songId;
  vocalAudioUploadSourceSongId=sourceSongId||null;
  vocalAudioUploadCoro=coro;
  vocalAudioUploadDia=dia||'domingo';
  document.getElementById('vocal-audio-upload-input').click();
}

async function handleVocalAudioUpload(e){
  const file=e.target.files[0];
  if(!file||!vocalAudioUploadRepId||!vocalAudioUploadSongId||!vocalAudioUploadCoro)return;
  if(!supabaseReady){alert('Sin conexión a Supabase');return}
  
  // Resolve source_song_id: prefer explicit value, then DB lookup, then local cache
  let sourceSongId=vocalAudioUploadSourceSongId;
  if(!sourceSongId){
    // Try DB lookup first (most reliable)
    try{
      const {data:crData}=await supabaseClient.from('canciones_repertorio').select('source_song_id').eq('id',vocalAudioUploadSongId).single();
      if(crData&&crData.source_song_id)sourceSongId=crData.source_song_id;
    }catch(e){}
  }
  if(!sourceSongId){
    // Fallback to local cache
    const r=repertorios.find(x=>x.id===vocalAudioUploadRepId);
    const cancionesRep=r?r.canciones.find(x=>x.id===vocalAudioUploadSongId):null;
    if(cancionesRep&&cancionesRep.source_song_id)sourceSongId=cancionesRep.source_song_id;
  }
  if(!sourceSongId){
    alert('No se pudo determinar el ID de la canción. Asegúrate de que la canción esté en tu biblioteca.');
    e.target.value='';
    return;
  }
  
  // ALWAYS use consistent filename: {sourceSongId}_coro{N}_{dia}.mp3
  const filename=sourceSongId+'_coro'+vocalAudioUploadCoro+'_'+vocalAudioUploadDia+'.mp3';
  const storagePath='vocal-audios/'+filename;
  
  try{
    // CLEANUP: Delete existing vocal audio for this source_song_id + coro + dia
    const extensions=['mp3','wav','ogg','m4a','aac','flac','webm'];
    
    // Search across all repertorios for existing vocal audios (exact match by dia)
    for(const rep of repertorios){
      if(rep.vocalAudios){
        const existing=rep.vocalAudios.find(va=>va.source_song_id===sourceSongId&&va.coro_number===vocalAudioUploadCoro&&va.dia===vocalAudioUploadDia);
        if(existing){
          // Delete the existing path - use audio_url (has timestamped filename)
          if(existing.audio_url){
            try{await fetch(R2_WORKER_URL+'/file/'+extractR2Key(existing.audio_url),{method:'DELETE'});}catch(e){}
          }
          // Also try audio_path as fallback
          if(existing.audio_path){
            try{await fetch(R2_WORKER_URL+'/file/'+encodeURIComponent(extractR2Key(existing.audio_path)),{method:'DELETE'});}catch(e){}
          }
          break;
        }
      }
    }
    
    // Upload new audio with consistent filename
    const renamedFile=new File([file],filename,{type:file.type||'audio/mpeg'});
    const formData=new FormData();
    formData.append('file',renamedFile);
    formData.append('folder','vocal-audios');
    formData.append('filename',filename);
    const uploadRes=await fetch(R2_WORKER_URL+'/upload',{method:'POST',body:formData});
    const uploadData=await uploadRes.json();
    if(uploadData.error)throw new Error(uploadData.error);
    let audioUrl=uploadData.url;
    
    // Fix double path in URL - normalize it
    if(audioUrl){
      audioUrl=normalizeVocalAudioUrl(audioUrl);
    }
    
    // Ensure URL uses consistent path - prefer Supabase Storage URL
    if(!audioUrl||!audioUrl.includes(sourceSongId)){
      // Build correct Supabase Storage public URL
      audioUrl=SUPABASE_URL+'/storage/v1/object/public/vocal-audios/'+storagePath;
    }
    // Final normalization to fix any double paths
    audioUrl=normalizeVocalAudioUrl(audioUrl);
    
    // Use UPSERT with onConflict - handles both insert and update in one operation
    // The unique constraint must include (source_song_id, coro_number, dia)
    const {data:upsertData,error:dbErr}=await supabaseClient.from('vocal_audios').upsert({
      cancion_repertorio_id:vocalAudioUploadSongId,
      repertorio_id:vocalAudioUploadRepId,
      source_song_id:sourceSongId,
      coro_number:vocalAudioUploadCoro,
      dia:vocalAudioUploadDia,
      vocalista_name:'',
      audio_url:audioUrl,
      audio_path:storagePath,
      updated_at:Date.now()
    },{onConflict:'source_song_id,coro_number,dia'});
    if(dbErr)throw dbErr;
    
    await loadRepertorios();
    renderRepertorioView();
    showNotification('Audio del Coro '+vocalAudioUploadCoro+' guardado','success');
  }catch(err){
    alert('Error al subir audio: '+err.message);
  }
  
  e.target.value='';
  vocalAudioUploadCoro=null;
  vocalAudioUploadRepId=null;
  vocalAudioUploadSongId=null;
  vocalAudioUploadSourceSongId=null;
}

async function deleteVocalAudio(repId,songId,coro,sourceSongId,dia){
  if(!canEditVocals())return;
  if(!confirm('¿Eliminar este audio de coro?'))return;
  
  // Resolve source_song_id: prefer explicit, then DB, then local cache
  let resolvedSourceId=sourceSongId;
  if(!resolvedSourceId){
    try{
      const {data:crData}=await supabaseClient.from('canciones_repertorio').select('source_song_id').eq('id',songId).single();
      if(crData&&crData.source_song_id)resolvedSourceId=crData.source_song_id;
    }catch(e){}
  }
  if(!resolvedSourceId){
    const r=repertorios.find(x=>x.id===repId);
    if(r){
      const cancionesRep=r.canciones.find(x=>x.id===songId);
      if(cancionesRep&&cancionesRep.source_song_id)resolvedSourceId=cancionesRep.source_song_id;
    }
  }
  if(!resolvedSourceId){resolvedSourceId=songId;}
  
  const r=repertorios.find(x=>x.id===repId);
  if(!r||!r.vocalAudios)return;
  
  const existing=r.vocalAudios.find(va=>(va.source_song_id||va.cancion_repertorio_id)===resolvedSourceId&&va.coro_number===coro&&va.dia===dia);
  if(!existing)return;
  
  try{
    // Delete from storage using the correct path (includes dia)
    const extensions=['mp3','wav','ogg','m4a','aac','flac','webm'];
    
    // Delete existing path from DB record - use audio_url (has timestamped filename)
    if(existing.audio_url){
      try{await fetch(R2_WORKER_URL+'/file/'+extractR2Key(existing.audio_url),{method:'DELETE'});}catch(e){}
    }
    // Also try audio_path as fallback
    if(existing.audio_path){
      try{await fetch(R2_WORKER_URL+'/file/'+encodeURIComponent(extractR2Key(existing.audio_path)),{method:'DELETE'});}catch(e){}
    }
    
    // Delete from database
    await supabaseClient.from('vocal_audios').delete().eq('id',existing.id);
    await loadRepertorios();
    renderRepertorioView();
    showNotification('Audio eliminado','success');
  }catch(err){
    alert('Error al eliminar: '+err.message);
  }
}

async function updateVocalAudioName(repId,songId,coro,name){
  const r=repertorios.find(x=>x.id===repId);
  if(!r||!r.vocalAudios)return;
  
  const existing=r.vocalAudios.find(va=>va.cancion_repertorio_id===songId&&va.coro_number===coro);
  if(!existing)return;
  
  try{
    await supabaseClient.from('vocal_audios').update({vocalista_name:name,updated_at:Date.now()}).eq('id',existing.id);
    existing.vocalista_name=name;
  }catch(err){
    console.error('Error updating vocal name:',err);
  }
}

// Play vocal audio with proper error handling
let vocalAudioPlayers={};
let vocalAudioCurrentKey=null;
function playVocalAudio(key,url){
  // Normalize URL first
  url=normalizeVocalAudioUrl(url);
  
  // If clicking the same key that's playing, pause it (toggle)
  if(vocalAudioCurrentKey===key&&vocalAudioPlayers[key]){
    if(!vocalAudioPlayers[key].paused){
      vocalAudioPlayers[key].pause();
      stopVocalAudioProgress();
      updateVocalAudioButtons();
      return true;
    }else{
      vocalAudioPlayers[key].play().catch(function(e){console.error('Resume error:',e)});
      startVocalAudioProgress();
      updateVocalAudioButtons();
      return true;
    }
  }
  
  // Stop any currently playing vocal audio
  if(vocalAudioCurrentKey&&vocalAudioPlayers[vocalAudioCurrentKey]){
    vocalAudioPlayers[vocalAudioCurrentKey].pause();
    vocalAudioPlayers[vocalAudioCurrentKey].currentTime=0;
    delete vocalAudioPlayers[vocalAudioCurrentKey];
    vocalAudioCurrentKey=null;
  }
  
  // Also stop rep audio and view audio when playing vocal
  if(repAudioEl){repAudioEl.pause();repAudioPlaying=false;stopAudioProgress();updateAudioBtn()}
  if(viewAudioEl){viewAudioEl.pause();viewAudioPlaying=false;stopViewAudioProgress();updateViewAudioBtn()}
  
  const audio=new Audio();
  audio.crossOrigin='anonymous';
  audio.preload='auto';
  
  audio.addEventListener('error',function(){
    console.error('Vocal audio error for URL:',url);
    const err=audio.error;
    console.error('Error code:',err?err.code:'unknown','Message:',err?err.message:'unknown');
    // Try alternative URL patterns
    if(url.includes('supabase.co')){
      // Try R2 Worker as fallback
      const pathMatch=url.match(/\/([^\/]+\/[^\/]+)$/);
      if(pathMatch){
        const storagePath=pathMatch[1];
        console.log('Trying R2 fallback for:',storagePath);
        const r2Url=R2_WORKER_URL+'/file/'+encodeURIComponent(storagePath);
        audio.src=r2Url;
        audio.play().catch(function(e2){
          console.error('R2 fallback also failed:',e2);
          showNotification('Error al reproducir audio. URL: '+url,'error');
        });
      }else{
        showNotification('Error al reproducir audio vocal','error');
      }
    }else{
      showNotification('Error al reproducir audio vocal','error');
    }
  });
  
  audio.addEventListener('canplay',function(){
    console.log('Vocal audio ready to play');
  });
  
  audio.addEventListener('ended',function(){
    delete vocalAudioPlayers[key];
    vocalAudioCurrentKey=null;
    stopVocalAudioProgress();
    updateVocalAudioButtons();
  });
  
  audio.src=url;
  vocalAudioPlayers[key]=audio;
  vocalAudioCurrentKey=key;
  
  audio.play().then(function(){
    console.log('Playing vocal audio:',url);
    updateVocalAudioButtons();
    startVocalAudioProgress();
  }).catch(function(e){
    console.error('Play error:',e);
    delete vocalAudioPlayers[key];
    vocalAudioCurrentKey=null;
    showNotification('No se pudo reproducir el audio vocal','error');
  });
  return true;
}

async function handleAudioUpload(e){
  const file=e.target.files[0];if(!file||!audioUploadSongId)return;
  if(!supabaseReady){alert('Sin conexión a Supabase');return}
  
  const si=songs.findIndex(s=>s.id===audioUploadSongId);
  if(si===-1){alert('Canción no encontrada');e.target.value='';audioUploadSongId=null;return}
  const songTitle=songs[si].title;
  const songId=songs[si].id; // This IS the source_song_id - the universal identifier
  
  // The filename we send to Worker: {songId}.mp3
  // Worker will store it as: {timestamp}-{songId}.mp3
  const sendFilename=songId+'.mp3';
  
  // Show loading state on upload zone if visible
  const zone=document.getElementById('view-upload-zone');
  if(zone){zone.innerHTML='<div class="upload-progress"><div class="upload-progress-bar"><div class="upload-progress-fill" id="upload-fill" style="width:10%"></div></div><p style="font-size:.75rem;color:#a1a1aa;margin-top:8px">Subiendo '+esc(songTitle)+'...</p></div>';}
  
  // Also show loading on library button
  const btn=document.querySelector('[data-audio-upload="'+audioUploadSongId+'"]');
  if(btn)btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/></svg>';
  
  try{
    const fill=document.getElementById('upload-fill');if(fill)fill.style.width='15%';
    
    // STEP 1: Delete ALL existing audio variants for this song ID
    // The Worker stores files as: {timestamp}-{songId}.mp3
    // We must use the STORED audio_url to find the actual file
    const pathsToDelete=new Set();
    
    // PRIORITY 1: Use the stored audio_url (has correct timestamp)
    if(songs[si].audio_url){
      try{
        const storedKey=extractR2Key(songs[si].audio_url);
        pathsToDelete.add(storedKey);
        console.log('Will delete stored audio:',storedKey);
      }catch(e){}
    }
    
    // PRIORITY 2: Check Supabase canciones_repertorio for any stored URLs
    try{
      const {data:repSongs}=await supabaseClient.from('canciones_repertorio')
        .select('audio_url').eq('source_song_id',songId);
      if(repSongs){
        repSongs.forEach(rs=>{
          if(rs.audio_url){
            try{
              const p=extractR2Key(rs.audio_url);
              pathsToDelete.add(p);
              console.log('Will delete from repertorio:',p);
            }catch(e){}
          }
        });
      }
    }catch(e){}
    
    // PRIORITY 3: Check user_songs for any stored URLs
    try{
      const {data:userSongs}=await supabaseClient.from('user_songs').select('song_data');
      if(userSongs){
        for(const us of userSongs){
          try{
            const sd=typeof us.song_data==='string'?JSON.parse(us.song_data):us.song_data;
            if(sd&&(sd.id===songId||(sd.sourceId&&sd.sourceId===songId))){
              if(sd.audio_url){
                const p=extractR2Key(sd.audio_url);
                pathsToDelete.add(p);
                console.log('Will delete from user_song:',us.id,p);
              }
            }
          }catch(parseErr){}
        }
      }
    }catch(e){}
    
    // Execute all deletions
    for(const delPath of pathsToDelete){
      try{
        console.log('Deleting from R2:',delPath);
        const res=await fetch(R2_WORKER_URL+'/file/'+encodeURIComponent(delPath),{method:'DELETE'});
        console.log('Delete response:',res.status,delPath);
      }catch(e){console.log('Delete failed:',delPath,e.message)}
    }
    
    if(pathsToDelete.size===0)console.log('No existing audio found to delete for song:',songId);
    
    if(fill)fill.style.width='35%';
    
    // STEP 2: Upload new audio
    // Send with filename hint - Worker will prepend timestamp
    const renamedFile=new File([file],sendFilename,{type:file.type||'audio/mpeg'});
    const formData=new FormData();
    formData.append('file',renamedFile);
    formData.append('folder','songs');
    const uploadRes=await fetch(R2_WORKER_URL+'/upload',{method:'POST',body:formData});
    const uploadData=await uploadRes.json();
    
    if(uploadData.error){
      alert('Error al subir audio: '+uploadData.error);
      if(viewingSongId===audioUploadSongId){renderView()}
      else{renderLibrary()}
      e.target.value='';audioUploadSongId=null;
      return;
    }
    
    if(fill)fill.style.width='65%';
    
    // Get the ACTUAL URL from Worker (with timestamp prefix)
    // This is the URL we MUST store and use for everything
    const audioUrl=normalizeVocalAudioUrl(uploadData.url);
    console.log('Audio uploaded. Actual URL from Worker:',audioUrl);
    
    if(!audioUrl){
      alert('Error: Worker no devolvió URL');
      if(viewingSongId===audioUploadSongId){renderView()}
      else{renderLibrary()}
      e.target.value='';audioUploadSongId=null;
      return;
    }
    
    // Save to local library (source of truth)
    songs[si].audio_url=audioUrl;
    save('cb_songs',songs);
    
    // CRITICAL: Sync to user_songs so other devices pick up the change
    if(currentUser&&supabaseReady){
      try{await syncSongsToCloud()}catch(e){console.log('syncSongsToCloud after upload failed:',e.message)}
    }
    
    if(fill)fill.style.width='80%';
    
    // STEP 3: Update ALL references by source_song_id
    try{
      // Update canciones_repertorio
      await supabaseClient.from('canciones_repertorio')
        .update({audio_url:audioUrl}).eq('source_song_id',songId);
      console.log('Updated canciones_repertorio for song:',songId);
      
      // ALSO sync to ALL users' libraries using the proven sync function
      try{
        await syncRepertorioToAllUsers({
          titulo:songTitle,
          artista:songs[si].artist,
          letra_acordes:songs[si].lyrics,
          tono_original:songs[si].originalKey,
          tempo:songs[si].tempo,
          compas:songs[si].compas,
          audio_url:audioUrl
        },songId);
        console.log('Called syncRepertorioToAllUsers for:',songId);
      }catch(syncErr){
        console.error('syncRepertorioToAllUsers failed:',syncErr);
      }
      

    }catch(dbErr){console.log('DB update error:',dbErr.message)}
    
    // Reload repertorios so Historial shows the updated audio
    try{await loadRepertorios()}catch(e){console.log('Reload repertorios error:',e.message)}
    
    if(fill)fill.style.width='100%';
    
    await new Promise(r=>setTimeout(r,500));
    
    // Re-render
    if(viewingSongId===audioUploadSongId){renderView()}
    else{renderLibrary()}
    
    // Also re-render repertorio view if it's currently open
    if(viewingRepId){renderRepertorioView()}
    
    showNotif('import-notification','Audio vinculado a "'+songTitle+'"','success');
    
  }catch(err){
    alert('Error al subir audio: '+err.message);
    if(viewingSongId===audioUploadSongId){renderView()}
    else{renderLibrary()}
  }
  e.target.value='';audioUploadSongId=null;
}

// ============= VOCAL EDITOR (PER-DAY MODE) =============
let vocalEditorRepId=null;
let vocalEditorSongId=null;
let vocalEditorMode='add';
let vocalEditorContextDay='domingo'; // Which day tab triggered the editor
let vocalEditorDay='ambos'; // Day selector for repertorio assignment (add mode only)
let addSongDefaultDia='ambos'; // Default dia when adding from day tab
let addSongDirectMode=false; // If true, skip vocal editor and add directly

function editRepVocals(repId,songId){
  const r=repertorios.find(x=>x.id===repId);if(!r)return;
  const s=r.canciones.find(x=>x.id===songId);if(!s)return;
  showVocalEditor(repId,songId,'edit',s,repDay);
}

function showVocalEditor(repId,songId,mode,songData,contextDay){
  vocalEditorRepId=repId;
  vocalEditorSongId=songId;
  vocalEditorMode=mode;
  vocalEditorContextDay=contextDay||'domingo';
  vocalEditorDay=songData?(songData.dia||'ambos'):'ambos';

  const isDom=vocalEditorContextDay==='domingo';
  const dayColor=isDom?'#fbbf24':'#c084fc';
  const dayLabel=isDom?'Domingo':'Lunes';
  const dayEmoji=isDom?'🌞':'🌙';

  // Update modal header
  document.getElementById('vocal-editor-title').textContent=mode==='add'?'Asignar vocales':'Editar vocales';
  document.getElementById('vocal-editor-subtitle').textContent='Para '+dayEmoji+' '+dayLabel;

  // Update day badge
  const badge=document.getElementById('vocal-editor-day-badge');
  badge.textContent=dayLabel;
  badge.style.background=isDom?'rgba(245,158,11,.2)':'rgba(192,132,252,.2)';
  badge.style.color=dayColor;

  // Update labels color
  document.getElementById('vocal-main-label').textContent='Vocalista principal '+dayLabel;
  document.getElementById('vocal-main-label').style.color=dayColor;
  document.getElementById('vocal-coros-label').textContent='Coros '+dayLabel;
  document.getElementById('vocal-coros-label').style.color=dayColor;

  // Update section SVG strokes to match day color
  const mainSvg=document.querySelector('#vocal-section-main svg');
  if(mainSvg)mainSvg.setAttribute('stroke',dayColor);
  const corosSvg=document.querySelector('#vocal-section-coros svg');
  if(corosSvg)corosSvg.setAttribute('stroke',dayColor);

  // Get local saved vocals
  const localSong=songs.find(x=>x.id===songId);
  const savedVocals=localSong?{
    vocalista_domingo:localSong.vocalista_domingo||'',
    vocalista_lunes:localSong.vocalista_lunes||'',
    coros_domingo:localSong.coros_domingo||[],
    coros_lunes:localSong.coros_lunes||[]
  }:null;

  // Load data for the specific day
  let mainName='';
  let corosRaw=[];
  if(isDom){
    mainName=songData?(songData.vocalista_domingo||''):(savedVocals?savedVocals.vocalista_domingo:'');
    corosRaw=songData?(songData.coros_domingo||[]):(savedVocals?savedVocals.coros_domingo:[]);
  }else{
    mainName=songData?(songData.vocalista_lunes||''):(savedVocals?savedVocals.vocalista_lunes:'');
    corosRaw=songData?(songData.coros_lunes||[]):(savedVocals?savedVocals.coros_lunes:[]);
  }
  if(typeof corosRaw==='string')corosRaw=corosRaw?corosRaw.split(',').map(function(x){return x.trim()}).filter(Boolean):[];
  if(!Array.isArray(corosRaw))corosRaw=[];

  document.getElementById('vocal-input-main').value=mainName;
  for(let i=1;i<=4;i++){
    const el=document.getElementById('vocal-coro-'+i);
    if(el)el.value=corosRaw[i-1]||'';
  }

  // Render audio list for this day
  renderVocalAudioList(vocalEditorContextDay);

  document.getElementById('vocal-editor-modal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('vocal-input-main').focus(),100);
}

function renderVocalAudioList(day){
  const list=document.getElementById('vocal-audio-list');
  if(!list)return;
  const r=repertorios.find(x=>x.id===vocalEditorRepId);
  const cancionesRep=r?r.canciones.find(x=>x.id===vocalEditorSongId):null;
  const sourceSongId=cancionesRep?(cancionesRep.source_song_id||vocalEditorSongId):vocalEditorSongId;
  const songAudios=[];
  if(r&&r.vocalAudios){
    r.vocalAudios.forEach(va=>{
      if((va.source_song_id||va.cancion_repertorio_id)===sourceSongId&&va.dia===day){
        songAudios.push(va);
      }
    });
  }
  const coroNames=[];
  for(let i=1;i<=4;i++){
    const el=document.getElementById('vocal-coro-'+i);
    coroNames.push(el?el.value.trim():'');
  }
  const isDom=day==='domingo';
  const dayColor=isDom?'#fbbf24':'#c084fc';
  let html='';
  for(let coro=1;coro<=4;coro++){
    const audio=songAudios.find(va=>va.coro_number===coro);
    const coroName=coroNames[coro-1]||'';
    const audioKey=vocalEditorRepId+'_'+vocalEditorSongId+'_'+day+'_'+coro;
    html+='<div style="background:rgba(27,27,30,.5);border:1px solid rgba(63,63,70,.3);border-radius:8px;padding:10px;margin-bottom:8px">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
    html+='<span style="font-size:.75rem;font-weight:600;color:'+dayColor+'">Coro '+coro+(coroName?' — '+esc(coroName):'')+'</span>';
    if(canEditVocals()){
      html+='<button class="btn-icon" onclick="triggerVocalAudioUpload(\''+vocalEditorRepId+'\',\''+vocalEditorSongId+'\','+coro+',\''+sourceSongId+'\',\''+day+'\')" style="color:'+dayColor+'" title="Subir audio"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>';
    }
    html+='</div>';
    if(audio&&audio.audio_url){
      html+='<div style="display:flex;align-items:center;gap:8px">';
      html+='<button class="btn-icon" data-vocal-key="'+audioKey+'" onclick="playVocalAudio(\''+audioKey+'\',\''+audio.audio_url+'\')" style="color:#4ade80" title="Reproducir"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>';
      html+='<div style="flex:1;min-width:0;font-size:.7rem;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(audio.vocalista_name||coroName||'Audio Coro '+coro)+'</div>';
      if(canEditVocals()){
        html+='<button class="btn-icon btn-icon-red" onclick="deleteVocalAudio(\''+vocalEditorRepId+'\',\''+vocalEditorSongId+'\','+coro+',\''+sourceSongId+'\',\''+day+'\')" style="flex-shrink:0" title="Eliminar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      }
      html+='</div>';
    }else{
      html+='<div style="font-size:.7rem;color:#52525b;font-style:italic">Sin audio</div>';
    }
    html+='</div>';
  }
  list.innerHTML=html;
}

function hideVocalEditor(){
  document.getElementById('vocal-editor-modal').classList.add('hidden');
  document.getElementById('vocal-input-main').value='';
  vocalEditorDay='ambos';
  for(let i=1;i<=4;i++){
    const el=document.getElementById('vocal-coro-'+i);
    if(el)el.value='';
  }
}

async function saveVocalEditor(){
  const mainName=document.getElementById('vocal-input-main').value.trim()||'Por asignar';
  const isDom=vocalEditorContextDay==='domingo';

  // Build coros array from fields
  const coros=[];
  for(let i=1;i<=4;i++){
    const el=document.getElementById('vocal-coro-'+i);
    if(el&&el.value.trim())coros.push(el.value.trim());
  }

  // Save to local song for persistence
  const localSong=songs.find(x=>x.id===vocalEditorSongId);
  if(localSong){
    if(isDom){
      localSong.vocalista_domingo=mainName;
      localSong.coros_domingo=coros;
    }else{
      localSong.vocalista_lunes=mainName;
      localSong.coros_lunes=coros;
    }
    save('cb_songs',songs);
  }

  if(vocalEditorMode==='add'){
    const s=songs.find(x=>x.id===vocalEditorSongId);
    const r=repertorios.find(x=>x.id===vocalEditorRepId);
    if(!s||!r)return;
    const orden=r.canciones.length+1;
    const id='rs'+Date.now().toString(36);
    // Determine dia: from context or 'ambos' for general add
    const dia=vocalEditorDay!=='ambos'?vocalEditorDay:(isDom?'domingo':'lunes');
    const insertData={
      id,
      repertorio_id:vocalEditorRepId,
      titulo:s.title,
      artista:s.artist,
      dia,
      orden,
      tono_original:s.originalKey,
      tempo:s.tempo||0,
      compas:s.compas||'',
      duracion:'0:00',
      letra_acordes:s.lyrics,
      audio_url:s.audio_url||null,
      source_song_id:s.id,
      created_at:Date.now()
    };
    // Set vocalista and coros for the context day
    if(isDom){
      insertData.vocalista_domingo=mainName;
      insertData.coros_domingo=coros;
      insertData.vocalista_lunes='';
      insertData.coros_lunes=[];
    }else{
      insertData.vocalista_lunes=mainName;
      insertData.coros_lunes=coros;
      insertData.vocalista_domingo='';
      insertData.coros_domingo=[];
    }
    try{
      const {error}=await supabaseClient.from('canciones_repertorio').insert(insertData);
      if(error)throw error;
      document.getElementById('rep-song-picker').innerHTML='';
      await loadRepertorios();
      renderRepertorios();
      hideVocalEditor();
    }catch(e){alert('Error al guardar: '+e.message)}
  }else{
    // Edit mode: update only the context day's fields
    const updateData={};
    if(isDom){
      updateData.vocalista_domingo=mainName;
      updateData.coros_domingo=coros;
    }else{
      updateData.vocalista_lunes=mainName;
      updateData.coros_lunes=coros;
    }
    try{
      const {error}=await supabaseClient.from('canciones_repertorio').update(updateData).eq('id',vocalEditorSongId);
      if(error)throw error;
      try{
        const {data:cr}=await supabaseClient.from('canciones_repertorio').select('*').eq('id',vocalEditorSongId).single();
        if(cr)await syncRepertorioToAllUsers(cr);
      }catch(syncErr){console.log('Sync skipped:',syncErr.message)}
      await loadRepertorios();
      renderRepertorioView();
      hideVocalEditor();
    }catch(e){alert('Error al guardar: '+e.message)}
  }
}


// ============= SQL PARA MODIFICAR TABLA admin_users =============
// Ejecuta esto en el SQL Editor de Supabase para agregar nombre y apellido:
/*
ALTER TABLE admin_users ADD COLUMN nombre TEXT;
ALTER TABLE admin_users ADD COLUMN apellido TEXT;

-- Si ya tienes datos existentes, puedes actualizarlos:
UPDATE admin_users SET nombre='Tu Nombre', apellido='Tu Apellido' WHERE id='admin';
*/

// ============= SQL PARA ARREGLAR RLS - TABLA vocal_audios =============
// Error: "new row violates row-level security policy"
// Ejecuta esto en el SQL Editor de Supabase para permitir inserts/updates:
/*
-- Habilitar RLS (si no está habilitado)
ALTER TABLE vocal_audios ENABLE ROW LEVEL SECURITY;

-- Política para permitir a usuarios anónimos/autenticados INSERT
CREATE POLICY "Allow insert vocal_audios" ON vocal_audios
  FOR INSERT WITH CHECK (true);

-- Política para permitir a usuarios anónimos/autenticados UPDATE
CREATE POLICY "Allow update vocal_audios" ON vocal_audios
  FOR UPDATE USING (true);

-- Política para permitir a usuarios anónimos/autenticados SELECT
CREATE POLICY "Allow select vocal_audios" ON vocal_audios
  FOR SELECT USING (true);

-- Política para permitir a usuarios anónimos/autenticados DELETE
CREATE POLICY "Allow delete vocal_audios" ON vocal_audios
  FOR DELETE USING (true);
*/

// ============= SQL PARA ARREGLAR RLS - STORAGE vocal-audios =============
// Error al subir audio al bucket vocal-audios
// Ve a Supabase Dashboard > Storage > vocal-audios > Policies
// Y crea estas políticas:
/*
-- Política para permitir uploads anónimos
CREATE POLICY "Allow anonymous uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'vocal-audios');

-- Política para permitir lectura anónima
CREATE POLICY "Allow anonymous reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'vocal-audios');

-- Política para permitir deletes anónimos
CREATE POLICY "Allow anonymous deletes" ON storage.objects
  FOR DELETE USING (bucket_id = 'vocal-audios');
*/

// ============= SQL PARA ARREGLAR RLS - STORAGE repertorio-audios =============
// Si también tienes problemas con el bucket repertorio-audios:
/*
-- Política para permitir uploads anónimos
CREATE POLICY "Allow anonymous uploads repertorio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'repertorio-audios');

-- Política para permitir lectura anónima
CREATE POLICY "Allow anonymous reads repertorio" ON storage.objects
  FOR SELECT USING (bucket_id = 'repertorio-audios');
*/

// ============= SQL PARA TABLA user_songs (sync de canciones) =============
// Ejecuta esto en el SQL Editor de Supabase:
/*
CREATE TABLE user_songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id),
  song_data JSONB NOT NULL,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Índice para buscar canciones por usuario
CREATE INDEX idx_user_songs_user_id ON user_songs(user_id);

-- Índice para buscar por ID de canción
CREATE INDEX idx_user_songs_song_id ON user_songs((song_data->>'id'));

-- IMPORTANTE: Deshabilitar RLS para que el Anon key pueda leer/escribir
ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;
*/

// ============= SQL PARA AGREGAR source_song_id a canciones_repertorio =============
// Ejecuta esto en el SQL Editor de Supabase:
/*
ALTER TABLE canciones_repertorio ADD COLUMN source_song_id TEXT;
CREATE INDEX idx_canciones_rep_source ON canciones_repertorio(source_song_id);
*/

// ============= SQL URGENTE: DESHABILITAR RLS EN user_songs =============
// Si las canciones no se sincronizan al iniciar sesión, ejecuta esto en Supabase SQL Editor:
/*
ALTER TABLE user_songs DISABLE ROW LEVEL SECURITY;
*/

// ============= NOTIFICATION FUNCTION =============
function showNotification(message, type) {
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
  `;
  
  if (type === 'success') {
    div.style.background = 'rgba(34,197,94,.9)';
    div.style.color = '#fff';
  } else {
    div.style.background = 'rgba(248,113,113,.9)';
    div.style.color = '#fff';
  }
  
  div.textContent = message;
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transition = 'opacity .3s';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// Add animation
if (!document.getElementById('notification-styles')) {
  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = '@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(style);
}

// INIT
showConnectionStatus();
loadRepertorios().then(()=>renderLibrary());

// ============= SQL MIGRATION: Fix vocal_audios table =============
// Ejecuta esto en Supabase Dashboard → SQL Editor:
/*
-- PASO 1: Eliminar TODOS los constraints unique existentes en vocal_audios
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint 
    WHERE conrelid = 'vocal_audios'::regclass AND contype = 'u'
  LOOP
    EXECUTE 'ALTER TABLE vocal_audios DROP CONSTRAINT IF EXISTS ' || r.conname;
    RAISE NOTICE 'Eliminado: %', r.conname;
  END LOOP;
END $$;

-- PASO 2: Asegurar que la columna dia exista
ALTER TABLE vocal_audios ADD COLUMN IF NOT EXISTS dia TEXT DEFAULT 'ambos';
UPDATE vocal_audios SET dia = 'ambos' WHERE dia IS NULL;

-- PASO 3: Crear el constraint correcto con dia incluido
ALTER TABLE vocal_audios ADD CONSTRAINT vocal_audios_unique 
  UNIQUE (source_song_id, coro_number, dia);

-- PASO 4: Verificar que funcionó
SELECT conname FROM pg_constraint 
WHERE conrelid = 'vocal_audios'::regclass AND contype = 'u';

-- PASO 5: Ver los datos actuales
SELECT id, source_song_id, coro_number, dia, audio_url FROM vocal_audios;
*/

// ============= PWA SERVICE WORKER =============
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js').then(function(registration){
      console.log('[PWA] Service Worker registered, scope:',registration.scope);
      // Check for updates every 60 seconds
      setInterval(function(){registration.update()},60000);
      // Listen for updates
      registration.addEventListener('updatefound',function(){
        var newWorker=registration.installing;
        if(newWorker){
          newWorker.addEventListener('statechange',function(){
            if(newWorker.state==='installed'&&navigator.serviceWorker.controller){
              // New version available - notify user
              if(confirm('Hay una nueva versión disponible. ¿Actualizar ahora?')){
                newWorker.postMessage({type:'SKIP_WAITING'});
                window.location.reload();
              }
            }
          });
        }
      });
    }).catch(function(err){
      console.log('[PWA] Service Worker registration failed:',err);
    });
  });
  // Reload when new service worker takes over
  var refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(!refreshing){refreshing=true;window.location.reload()}
  });
}
