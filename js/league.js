// Lig sistemi (istemci): oyuncunun ligi/parası sunucuda (lig.php, PostgreSQL). Para ve ödülü sunucu hesaplar;
// burası görev başladı/bitti/başarısız, harcama (bilet, hastane, ceza) ve şehir bildirir, ESC'deki sıralamayı çizer.
// Çevrimdışı (yalnız yerelde ?nosave=1): aynı kurallar tarayıcıda hesaplanır, hiçbir şey kaydedilmez (testler için).
import { formatMoney } from './util.js';

const CFG = window.LEAGUE_CFG || { leagues: { 1: { id: 1, name: 'Tahta', limit: 100000, start: 15000, decay: 50, mission: 'steal' } }, startMoney: 5000, sideReward: 500, last: 7 };
export const LEAGUES = CFG.leagues;
export const SIDE_REWARD = CFG.sideReward;
const $ = (id) => document.getElementById(id);

export function fmtTime(ms) {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}
export function leagueTitle(id, stage = 1) { const L = LEAGUES[id]; return id === CFG.last ? `${L.name} ${stage}` : L.name; }

export class League {
  constructor(game) {
    this.g = game;
    this.offline = !window.PLAYER;
    this.me = window.PLAYER || { username: 'Misafir', league: 1, stage: 1, money: CFG.startMoney, city: 'palmera', bestMs: null, moneyRank: 1, leaguePlayers: 1, timeRank: null, timeCount: 0 };
    this.attempt = null;   // sunucudaki deneme kaydının id'si (Promise)
  }
  get L() { return LEAGUES[this.me.league]; }
  get title() { return leagueTitle(this.me.league, this.me.stage); }
  // oyuncunun liginin görevi (henüz yoksa null)
  get mission() { return this.L.mission; }

  async api(a, data = {}) {
    try {
      const r = await fetch('lig.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a, ...data }) });
      const j = await r.json();
      if (r.status === 401) this.g.hud.notify('Oturumun kapanmış: ilerlemen kaydedilmiyor. Sayfayı yenileyip yeniden giriş yap.', 8);
      return j;
    } catch (e) {
      return { ok: false, error: 'Sunucuya ulaşılamadı.' };
    }
  }
  applyMe(me) {
    if (!me) return;
    this.me = me;
    this.g.money = me.money;
    this.updateBadge();
  }

  // ---------- görevler ----------
  startMission(kind, id) {
    if (this.offline) { this.attempt = Promise.resolve(-1); return; }
    this.attempt = this.api('start', { kind, mission: id }).then((j) => {
      if (!j.ok) { this.g.hud.notify(`Görev sunucuya kaydedilemedi: ${j.error}`, 6); return null; }
      return j.id;
    });
  }
  // ms: oyun içi süre (duraklatma hariç). Döner: { reward, timeMs, newBest, levelUp, timeout } ya da { error }
  async finishMission(kind, ms) {
    const p = this.attempt; this.attempt = null;
    if (this.offline) return this.finishOffline(kind, ms);
    const id = p && await p;
    if (!id) return { error: 'Görev kaydı yok, ödül verilemedi.' };
    const j = await this.api('finish', { id, ms: Math.round(ms) });
    if (!j.ok) return { error: j.error || 'Sunucu hatası.' };
    this.applyMe(j.me);
    return j;
  }
  failMission() {
    const p = this.attempt; this.attempt = null;
    if (!this.offline && p) p.then((id) => { if (id) this.api('fail', { id }); });
  }
  finishOffline(kind, ms) {
    const me = this.me, L = this.L;
    let reward = SIDE_REWARD, newBest = false;
    if (kind === 'league') {
      reward = Math.round(L.start - L.decay * ms / 1000);
      if (reward <= 0) return { reward: 0, timeout: true };
      if (me.bestMs == null || ms < me.bestMs) { me.bestMs = Math.round(ms); newBest = true; }
    }
    me.money += reward;
    let levelUp = null;
    if (me.money >= L.limit) {
      levelUp = { from: me.league, fromStage: me.stage, money: me.money };
      if (me.league < CFG.last) { me.league++; me.stage = 1; } else me.stage++;
      Object.assign(levelUp, { to: me.league, toStage: me.stage });
      me.money = CFG.startMoney; me.bestMs = null;
    }
    this.applyMe(me);
    return { reward, timeMs: Math.round(ms), newBest, levelUp };
  }

  // ---------- harcama, şehir ----------
  spend(amount, reason) {
    amount = Math.floor(amount);
    if (amount <= 0) return;
    this.g.money = this.me.money = Math.max(0, this.g.money - amount);
    if (this.offline) return;
    this.api('spend', { amount, reason }).then((j) => { if (j.ok) this.g.money = this.me.money = j.money; });
  }
  setCity(city) {
    if (city === this.me.city) return;
    this.me.city = city;
    if (!this.offline) this.api('city', { city });
  }

  // ---------- arayüz ----------
  updateBadge() {
    const el = $('leaguebadge'); if (!el) return;
    el.innerHTML = `<b>${this.title.toLocaleUpperCase('tr')} LİGİ</b><small>hedef ${formatMoney(this.L.limit)}</small>`;
  }
  // ESC penceresi: oyuncunun kendi sıralaması (açılınca sunucudan tazelenir)
  async showRank() {
    const el = $('prank'); if (!el) return;
    this.renderRank(el);
    if (this.offline) return;
    try {
      const r = await fetch('lig.php?a=me', { credentials: 'same-origin' });
      const j = await r.json();
      if (j.ok) { this.applyMe(j.me); this.renderRank(el); }
    } catch (e) { /* çevrimdışı: eldeki bilgi */ }
  }
  renderRank(el) {
    const me = this.me, L = this.L;
    const left = Math.max(0, L.limit - this.g.money);
    const best = me.bestMs != null ? `${fmtTime(me.bestMs)} <i>(${me.timeRank ?? '–'}. / ${me.timeCount})</i>` : '<i>henüz yok</i>';
    el.innerHTML = `<div class="pr-head">${esc(me.username)} · <b>${this.title} Ligi</b>${this.offline ? ' <i>(çevrimdışı test)</i>' : ''}</div>` +
      `<div class="pr-grid"><span>Paran</span><b>${formatMoney(this.g.money)}</b>` +
      `<span>Para sıran</span><b>${me.moneyRank}. <i>/ ${me.leaguePlayers} oyuncu</i></b>` +
      `<span>En iyi süren</span><b>${best}</b>` +
      `<span>Lig hedefi</span><b>${formatMoney(L.limit)} <i>(kalan ${formatMoney(left)})</i></b></div>` +
      (L.mission ? '' : '<div class="pr-note">Bu ligin görevi yakında eklenecek. Şimdilik yardım görevleri ($500) açık.</div>');
  }
  levelUpText(u) {
    const to = LEAGUES[u.to];
    const head = u.from === u.to ? `${leagueTitle(u.from, u.fromStage)} tamamlandı! Yeni Elmas görevi açıldı.` : `${leagueTitle(u.from)} Ligi'ni ${formatMoney(u.money)} ile bitirdin.`;
    return `${head} Yeni lig: ${leagueTitle(u.to, u.toStage)} · hedef ${formatMoney(to.limit)} · görev ödülü ${formatMoney(to.start)}'dan başlar, saniyede ${formatMoney(to.decay)} azalır. ` +
      `Paran ${formatMoney(CFG.startMoney)}'dan yeniden başlıyor.` + (to.mission ? '' : ' Bu ligin görevi yakında eklenecek.');
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
