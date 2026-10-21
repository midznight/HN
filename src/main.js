import '@fontsource/inter/300.css'; import '@fontsource/inter/400.css'; import '@fontsource/inter/500.css'; import '@fontsource/inter/600.css'; import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/400.css'; import '@fontsource/playfair-display/500.css'; import '@fontsource/playfair-display/600.css';
import './tailwind.generated.css';
import { createIcons, icons } from 'lucide';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { Preferences } from '@capacitor/preferences';
import { initChat, onChatLocked, onChatUnlocked } from './chat.js';
import { initPushNotifications } from './push-notifications.js';
import { initVault } from './vault.js';

const K={identity:'os.identity.v1',salt:'os.pin.salt.v1',hash:'os.pin.hash.v1',failures:'os.pin.failures.v1',lockUntil:'os.pin.lockUntil.v1'};
const ITERATIONS=210000, $=id=>document.getElementById(id);
let identity=null, firstRun=true, currentView='chat', previousFrame=performance.now(), slowFrames=0, frameSamples=0;
let pendingPushOpenChat = false;
const read=async key=>(await Preferences.get({key})).value;
const write=async(key,value)=>Preferences.set({key,value:String(value)});
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function error(text){$('gate-error').textContent=text;$('gate-error').classList.remove('hidden')}
function clearError(){$('gate-error').textContent='';$('gate-error').classList.add('hidden')}
async function pinHash(pin,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},key,256))}
function gateMode(isFirst,hasIdentity){firstRun=isFirst;$('identity-picker').classList.toggle('hidden',hasIdentity);$('pin-confirm').classList.toggle('hidden',!isFirst);$('pin-label').textContent=isFirst?'Buat PIN baru (minimal 6 angka)':'Masukkan PIN';$('pin-input').placeholder=isFirst?'Buat PIN pribadi':'PIN pribadi';$('gate-subtitle').textContent=isFirst?'Siapkan akses lokal untuk perangkat ini':'Ruang privat Hamid & Nur';$('login-btn-label').textContent=isFirst?'Simpan PIN':'Buka ruang';$('gate-hint').textContent=isFirst?'PIN tidak dikirim ke server. Jangan gunakan tanggal jadian.':'PIN diverifikasi di perangkat ini.';$('pin-input').value='';$('pin-confirm').value='';clearError()}
async function initGate(){const [salt,savedIdentity]=await Promise.all([read(K.salt),read(K.identity)]);identity=savedIdentity;gateMode(!salt,Boolean(savedIdentity));createIcons({icons})}
function updateIdentity(){const own=identity==='nur'?'Nur':'Hamid',partner=identity==='nur'?'Hamid':'Nur';if($('profile-identity'))$('profile-identity').textContent=own+' & '+partner;const chatTitle=document.querySelector('#view-chat header h1');if(chatTitle)chatTitle.textContent=partner;const avatar=document.querySelector('#view-chat header img');if(avatar){avatar.src=partner==='Nur'?'/assets/avatar-nur.svg':'/assets/avatar-hamid.svg';avatar.alt=partner}document.querySelectorAll('#view-profile img').forEach((img,i)=>img.src=i===0?(own==='Nur'?'/assets/avatar-nur.svg':'/assets/avatar-hamid.svg'):(partner==='Nur'?'/assets/avatar-nur.svg':'/assets/avatar-hamid.svg'))}
function unlock(){ $('login-screen').classList.add('hidden');$('app-layout').classList.remove('hidden','opacity-0');$('app-layout').classList.add('flex','fade-in');updateIdentity();switchView(currentView);if(pendingPushOpenChat){pendingPushOpenChat=false;window.switchView('chat')}onChatUnlocked().catch(()=>{})}
function lock(){onChatLocked();window.ourSpaceVault?.onLocked();$('app-layout').classList.add('hidden','opacity-0');$('app-layout').classList.remove('flex');$('login-screen').classList.remove('hidden');$('pin-input').value='';$('pin-confirm').value='';initGate().catch(e=>{console.error('PIN gate reload failed',e);error('Pengaturan PIN gagal dimuat. Tutup dan buka aplikasi kembali.')})}
async function login(e){e.preventDefault();clearError();const pin=$('pin-input').value;if(!identity){error('Pilih identitas terlebih dahulu.');return}if(!/^\d{6,12}$/.test(pin)){error('PIN harus terdiri dari 6–12 angka.');return}const button=$('login-btn');button.disabled=true;try{if(firstRun){if(pin!==$('pin-confirm').value){error('Konfirmasi PIN tidak sama.');return}const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await pinHash(pin,salt);await write(K.identity,identity);await write(K.salt,encode(salt));await write(K.hash,encode(hash));await write(K.failures,'0');await write(K.lockUntil,'0');unlock();return}
const until=Number(await read(K.lockUntil)||0);if(Date.now()<until){error('Terlalu banyak percobaan. Coba lagi dalam '+Math.ceil((until-Date.now())/1000)+' detik.');return}
const [saltText,hashText]=await Promise.all([read(K.salt),read(K.hash)]);if(!saltText||!hashText){gateMode(true,true);error('PIN belum tersimpan dengan lengkap. Buat PIN baru.');return}
const actual=await pinHash(pin,decode(saltText)),expected=decode(hashText);let diff=actual.length^expected.length;for(let i=0;i<Math.max(actual.length,expected.length);i++)diff|=(actual[i]||0)^(expected[i]||0);
if(diff===0){await write(K.failures,'0');await write(K.lockUntil,'0');unlock();return}
const failures=Number(await read(K.failures)||0)+1,delay=failures>=3?Math.min(300,5*2**Math.min(failures-3,6)):0;await write(K.failures,failures);await write(K.lockUntil,Date.now()+delay*1000);$('pin-input').value='';error(delay?'PIN salah. Coba lagi setelah '+delay+' detik.':'PIN salah. Periksa kembali PIN kamu.');$('login-card').classList.remove('shake-anim');void $('login-card').offsetWidth;$('login-card').classList.add('shake-anim')
}catch(e){console.error('Local PIN verification failed',e);error('Penyimpanan lokal gagal diakses. Pastikan perangkat memiliki ruang.')}finally{button.disabled=false}}
window.switchView=function(view){const target=$('view-'+view);if(!target)return;currentView=view;if(view==='storage')window.ourSpaceVault?.onViewOpened().catch(e=>console.warn('Vault refresh failed',e));document.querySelectorAll('.app-view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));target.classList.add('active');const nav=[...document.querySelectorAll('.nav-item')].find(n=>n.getAttribute('onclick')==="switchView('"+view+"')");if(nav)nav.classList.add('active');if(view==='chat')$('chat-container').scrollTop=$('chat-container').scrollHeight;if(window.Capacitor?.isNativePlatform())Keyboard.hide().catch(e=>console.warn('Keyboard hide failed',e));createIcons({icons})};
window.togglePlay=button=>{const wave=button.nextElementSibling;if(wave)wave.classList.toggle('playing')};
window.spawnHeart=event=>{const el=document.createElement('div'),rect=event.currentTarget.getBoundingClientRect();el.textContent='❤';el.className='heart-particle';el.style.left=(event.clientX-rect.left)+'px';el.style.top=(event.clientY-rect.top)+'px';event.currentTarget.appendChild(el);if(navigator.vibrate)navigator.vibrate(50);setTimeout(()=>el.remove(),1000)};
document.querySelectorAll('[data-identity]').forEach(button=>button.addEventListener('click',async()=>{if(await read(K.identity))return;identity=button.dataset.identity;document.querySelectorAll('[data-identity]').forEach(item=>{item.classList.toggle('ring-2',item===button);item.classList.toggle('ring-brand-400',item===button)});clearError()}));
$('login-form').addEventListener('submit',login);
window.addEventListener('ourspace:push-open-chat',()=>{if($('login-screen').classList.contains('hidden'))window.switchView('chat');else pendingPushOpenChat=true});
if(window.Capacitor?.isNativePlatform()){
window.addEventListener('ourspace:attachment-picker-cancelled',()=>{if(!$('app-layout').classList.contains('hidden'))lock()});
App.addListener('appStateChange',({isActive})=>{
  if(!isActive&&!$('app-layout').classList.contains('hidden')){
    const picker=window.ourSpaceAttachmentPicker;
    if(picker?.isPending()){picker.onBackground();return}
    lock();
    return;
  }
  if(isActive)window.ourSpaceAttachmentPicker?.onForeground();
});
App.addListener('backButton',()=>{
  if(window.ourSpaceAttachmentPicker?.isPending())return;
  const preview=$('media-preview-modal');
  if(preview&&!preview.classList.contains('hidden')){$('media-preview-cancel')?.click();return}
  if($('login-screen').classList.contains('hidden')){
    if(currentView==='profile'){window.switchView('home');return}
    if(currentView!=='chat'){window.switchView('chat');return}
    lock();
  }
});
}
function frameMonitor(){const now=performance.now();if(now-previousFrame>40)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);previousFrame=now;if(++frameSamples>=90){document.documentElement.classList.toggle('no-blur',slowFrames>25);frameSamples=0;slowFrames=0}requestAnimationFrame(frameMonitor)}
requestAnimationFrame(frameMonitor);
initChat().catch(()=>{});
initVault();
initPushNotifications().catch(()=>{});
initGate().catch(e=>{console.error('PIN gate initialization failed',e);error('Tidak dapat menyiapkan kunci lokal. Mulai ulang aplikasi.')});
