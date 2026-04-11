window._demoMode = false;
var DEMO_BANNER_UI_KEY = 'demo_dismissed';
var LEGACY_DEMO_BANNER_UI_KEY = 'pokerhq_demo_dismissed';

function getDemoBannerStorageKey() {
  var cfg = window.PokerHQConfig || {};
  return cfg.resolveUiStorageKey ? cfg.resolveUiStorageKey(DEMO_BANNER_UI_KEY) : LEGACY_DEMO_BANNER_UI_KEY;
}

function readDemoBannerDismissed() {
  var cfg = window.PokerHQConfig || {};
  var keys = cfg.resolveUiReadKeys ? cfg.resolveUiReadKeys(DEMO_BANNER_UI_KEY, LEGACY_DEMO_BANNER_UI_KEY) : [LEGACY_DEMO_BANNER_UI_KEY];
  for (var i = 0; i < keys.length; i++) {
    if (localStorage.getItem(keys[i])) return true;
  }
  return false;
}

var _demoSessions = [
  {id:9001,date:'2026-03-22',name:'Okada Manila Millions - Day 1A',venue:'Okada Manila',buyin:7500,rebuy:0,total:7500,field:187,position:23,prize:0,pnl:-7500,hours:8.5,notes:'Deep run, busted AK vs QQ 3-way all-in',result:'bust',focus:8,energy:7,sleep:7,fasting:'no'},
  {id:9002,date:'2026-03-15',name:'Metro Sunday Main',venue:'Metro Card Club',buyin:3300,rebuy:3300,total:6600,field:214,position:4,prize:28000,pnl:21400,hours:11,notes:'Final table! Lost AJ vs K9 runner runner',result:'final',focus:9,energy:8,sleep:8,fasting:'yes'},
  {id:9003,date:'2026-03-08',name:'Solaire Weekly Special',venue:'Solaire Resort',buyin:5500,rebuy:0,total:5500,field:98,position:67,prize:0,pnl:-5500,hours:3,notes:'Card dead all day',result:'bust',focus:5,energy:4,sleep:4,fasting:'no'},
  {id:9004,date:'2026-03-01',name:'Metro Sunday Main',venue:'Metro Card Club',buyin:3300,rebuy:0,total:3300,field:198,position:18,prize:8500,pnl:5200,hours:9,notes:'ITM, busted 99 vs AA',result:'itm',focus:8,energy:9,sleep:9,fasting:'yes'},
  {id:9005,date:'2026-02-22',name:'Okada Daily Special',venue:'Okada Manila',buyin:3500,rebuy:3500,total:7000,field:112,position:54,prize:0,pnl:-7000,hours:4.5,notes:'Tough table draw',result:'bust',focus:6,energy:5,sleep:5,fasting:'no'},
  {id:9006,date:'2026-02-15',name:'Metro Saturday Turbo',venue:'Metro Card Club',buyin:2200,rebuy:0,total:2200,field:156,position:8,prize:7200,pnl:5000,hours:6,notes:'Good reads all day',result:'itm',focus:9,energy:8,sleep:8,fasting:'yes'},
  {id:9007,date:'2026-02-08',name:'Casino Filipino Weekly',venue:'Casino Filipino',buyin:2000,rebuy:2000,total:4000,field:88,position:44,prize:0,pnl:-4000,hours:3.5,notes:'Tilted after bad beat',result:'bust',focus:4,energy:6,sleep:6,fasting:'no'},
  {id:9008,date:'2026-02-01',name:'Okada Sunday Million',venue:'Okada Manila',buyin:12500,rebuy:0,total:12500,field:203,position:31,prize:0,pnl:-12500,hours:6,notes:'Played solid, ran bad',result:'bust',focus:8,energy:7,sleep:6,fasting:'no'},
  {id:9009,date:'2026-01-25',name:'Metro Sunday Main',venue:'Metro Card Club',buyin:3300,rebuy:0,total:3300,field:221,position:12,prize:12000,pnl:8700,hours:10,notes:'Top 10 deep run',result:'itm',focus:9,energy:9,sleep:8,fasting:'yes'},
  {id:9010,date:'2026-01-18',name:'Solaire Sunday Feature',venue:'Solaire Resort',buyin:5500,rebuy:5500,total:11000,field:76,position:2,prize:45000,pnl:34000,hours:12,notes:'2nd place — heads up lost flip',result:'final',focus:10,energy:9,sleep:9,fasting:'yes'},
  {id:9011,date:'2026-01-11',name:'Metro Saturday Turbo',venue:'Metro Card Club',buyin:2200,rebuy:0,total:2200,field:143,position:89,prize:0,pnl:-2200,hours:2,notes:'Early exit',result:'bust',focus:6,energy:5,sleep:4,fasting:'no'},
  {id:9012,date:'2026-01-04',name:'Okada Daily Special',venue:'Okada Manila',buyin:3500,rebuy:0,total:3500,field:134,position:15,prize:9500,pnl:6000,hours:8,notes:'Strong start to the year',result:'itm',focus:9,energy:8,sleep:9,fasting:'yes'},
  {id:9013,date:'2025-12-28',name:'Metro Year End Special',venue:'Metro Card Club',buyin:5500,rebuy:5500,total:11000,field:312,position:1,prize:95000,pnl:84000,hours:14,notes:'🏆 WON IT! Best result of the year',result:'final',focus:10,energy:10,sleep:9,fasting:'yes'},
  {id:9014,date:'2025-12-21',name:'Casino Filipino Christmas',venue:'Casino Filipino',buyin:3000,rebuy:0,total:3000,field:94,position:48,prize:0,pnl:-3000,hours:3,notes:'Nothing going',result:'bust',focus:5,energy:6,sleep:7,fasting:'no'},
  {id:9015,date:'2025-12-14',name:'Okada Sunday Million',venue:'Okada Manila',buyin:12500,rebuy:0,total:12500,field:189,position:22,prize:0,pnl:-12500,hours:5.5,notes:'AK < QQ for big pot',result:'bust',focus:7,energy:6,sleep:5,fasting:'no'},
  {id:9016,date:'2025-12-07',name:'Metro Sunday Main',venue:'Metro Card Club',buyin:3300,rebuy:3300,total:6600,field:234,position:9,prize:18000,pnl:11400,hours:10.5,notes:'Deep run again at Metro',result:'itm',focus:8,energy:8,sleep:7,fasting:'yes'},
  {id:9017,date:'2025-11-30',name:'Solaire Monthly Main',venue:'Solaire Resort',buyin:5500,rebuy:0,total:5500,field:88,position:55,prize:0,pnl:-5500,hours:4,notes:'Poor conditions, tired',result:'bust',focus:4,energy:3,sleep:3,fasting:'no'},
  {id:9018,date:'2025-11-22',name:'Metro Saturday Turbo',venue:'Metro Card Club',buyin:2200,rebuy:0,total:2200,field:167,position:6,prize:9800,pnl:7600,hours:7,notes:'Turbo structure suits my game',result:'itm',focus:9,energy:9,sleep:8,fasting:'yes'},
  {id:9019,date:'2025-11-15',name:'Okada Daily Special',venue:'Okada Manila',buyin:3500,rebuy:3500,total:7000,field:121,position:72,prize:0,pnl:-7000,hours:3,notes:'Bad spot early',result:'bust',focus:6,energy:7,sleep:6,fasting:'no'},
  {id:9020,date:'2025-11-08',name:'Casino Filipino Weekly',venue:'Casino Filipino',buyin:2000,rebuy:0,total:2000,field:76,position:3,prize:12000,pnl:10000,hours:8,notes:'Final table Casino Filipino',result:'final',focus:8,energy:7,sleep:8,fasting:'yes'}
];

var _demoTourneys = [
  {id:8001,date:'April 15, 2026',day:'15',month:'APR',series:'Metro Summer Event',name:'Main Event — Flight 1A',type:'main',venue:'Metro Card Club, Pasig',buyin:6500,gtd:'₱3,000,000',structure:'Regular',notes:'Multiple flights through April 20',source:'Metro Card Club',status:'target'},
  {id:8002,date:'April 29, 2026',day:'29',month:'APR',series:'Okada Manila Millions',name:'Main Event — Flight 1A',type:'main',venue:'Okada Manila, Parañaque',buyin:7500,gtd:'₱6,000,000',structure:'Deep Stack',notes:'Starts 12:00',source:'PokerStars Live Manila',status:'target'},
  {id:8003,date:'April 29, 2026',day:'29',month:'APR',series:'Okada Manila Millions',name:'Event #2 — NLH Side',type:'side',venue:'Okada Manila, Parañaque',buyin:1900,gtd:'',structure:'Regular',notes:'Starts 20:00',source:'PokerStars Live Manila',status:'target'},
  {id:8004,date:'April 30, 2026',day:'30',month:'APR',series:'Okada Manila Millions',name:'Event #4 — NLH',type:'side',venue:'Okada Manila, Parañaque',buyin:4500,gtd:'',structure:'Regular',notes:'Starts 12:00',source:'PokerStars Live Manila',status:'target'},
  {id:8005,date:'May 2, 2026',day:'2',month:'MAY',series:'Okada Manila Millions',name:'Event #13 — Satellite',type:'side',venue:'Okada Manila, Parañaque',buyin:2200,gtd:'',structure:'Satellite',notes:'Win seat to Super Stack',source:'PokerStars Live Manila',status:'target'},
  {id:8006,date:'May 3, 2026',day:'3',month:'MAY',series:'Okada Manila Millions',name:'Event #15 — Hyper Turbo',type:'side',venue:'Okada Manila, Parañaque',buyin:3500,gtd:'',structure:'Hyper Turbo',notes:'Starts 21:00',source:'PokerStars Live Manila',status:'target'},
  {id:8007,date:'May 10, 2026',day:'10',month:'MAY',series:'Okada Manila Millions',name:'Main Event — Final 9',type:'main',venue:'Okada Manila, Parañaque',buyin:0,gtd:'₱6,000,000',structure:'Regular',notes:'Final 9 players only',source:'PokerStars Live Manila',status:'target'},
  {id:8008,date:'April 22, 2026',day:'22',month:'APR',series:'APT Taipei 2026',name:'APT National Cup — Flight A',type:'main',venue:'Red Space, Taipei, Taiwan',buyin:21000,gtd:'₱26,250,000',structure:'Regular',notes:'Satellite qualification required',source:'AsianPokerTour.com',status:'stretch'}
];

var _demoHands = [
  {id:7001,sessionId:9002,session:'Metro Sunday Main — 2026-03-15',title:'Final table bubble — fold KQs facing 3-bet shove',desc:'6 handed on final table bubble. CO opens 2.5x, I 3-bet KQs from BTN, BB shoves 22BB. CO folds. ICM pressure enormous — folded. BB shows AJs.',lesson:'Correct fold given ICM. KQs vs AJs is a flip and busting on bubble vs locking up min-cash is a massive EV difference.',result:'fold'},
  {id:7002,sessionId:9010,session:'Solaire Sunday Feature — 2026-01-18',title:'Heads up — called off stack with second pair on river',desc:'HU, villain bets pot on AK743 board. I call with K9 for second pair. Villain shows A7 for two pair. Should have considered his value range on this runout.',lesson:'In HU pot-sized river bets, villain is rarely bluffing at this stack depth. Need to fold second pair more.',result:'lost'},
  {id:7003,sessionId:9013,session:'Metro Year End Special — 2025-12-28',title:'Won the tournament — final hand KK vs AQ all-in preflop',desc:'3-handed, shoved KK over button open, BB called off 28BB with AQ. Kings held. Took down the ₱95,000 first place prize.',lesson:'Standard spot. Played patiently through the final table and got it in good.',result:'won'},
  {id:7004,sessionId:9001,session:'Okada Manila Millions — 2026-03-22',title:'3-way all-in AK vs QQ vs 88 — 23 left',desc:'UTG shoves 18BB, I reshove AK from BTN for 24BB, BB calls off with QQ. UTG has 88. Board runs out Q8642. Lose to full house.',lesson:'Standard spot AK vs short stack. Unlucky to run into QQ and then see 88 hit a full house.',result:'lost'},
  {id:7005,sessionId:9009,session:'Metro Sunday Main — 2026-01-25',title:'Hero fold top pair vs river overbet — saved my tournament',desc:'UTG bet pot on AK4 flop, called. Turn 2, check-check. River 7, UTG overbets 1.5x pot. Folded AJ. UTG showed AK for top two.',lesson:'Rec players rarely overbet bluff the river. This read saved me 30BB and I went on to cash.',result:'fold'},
  {id:7006,sessionId:9020,session:'Casino Filipino Weekly — 2025-11-08',title:'3-bet bluff caught but villain folded river anyway',desc:'Bluffed 3 streets on K72 rainbow board with 56s. Villain called flop and turn then folded to 2.5x pot river bet. Running it twice works.',lesson:'Board texture and villain profile matter. This rec player was clearly unhappy with his hand by the turn.',result:'won'}
];

var _demoSatellites = [
  {id:6001,date:'2026-03-20',name:'Okada Daily Satellite',venue:'Okada Manila',buyin:1100,result:'lost',forEvent:'Okada Manila Millions Main Event',notes:'Busted KK vs AA 3 seats given'},
  {id:6002,date:'2026-03-14',name:'Okada Daily Satellite',venue:'Okada Manila',buyin:1100,result:'won',forEvent:'Okada Manila Millions Main Event',notes:'Won seat! Saved ₱6,400 vs direct buy-in'},
  {id:6003,date:'2026-03-07',name:'Metro Satellite to Sunday Main',venue:'Metro Card Club',buyin:550,result:'won',forEvent:'Metro Sunday Main Event',notes:'Fastest satellite win — 90 mins'},
  {id:6004,date:'2026-02-28',name:'Okada Daily Satellite',venue:'Okada Manila',buyin:1100,result:'lost',forEvent:'Okada Manila Millions Main Event',notes:'AK < 77 preflop flip'}
];

var _demoOpponents = [
  {id:5001,name:'The Limper (Seat 3)',venue:'Metro Card Club',tags:['loose','passive','calling-station'],notes:'Open limps 80% of hands UTG. Never folds top pair. Check-raise on turn always means two pair or better. Bet for value relentlessly.',added:'2026-03-15'},
  {id:5002,name:'Hoodie Guy',venue:'Okada Manila',tags:['reg','aggressive','bluffer'],notes:'GTO-aware regular. 3-bets wide in position. Overbets rivers as bluffs on bricked boards. Folds to 4-bets unless has it.',added:'2026-03-22'},
  {id:5003,name:'Old Man Coffee',venue:'Solaire Resort',tags:['tight','nit','passive'],notes:'Only plays premiums. If he raises preflop it is QQ+/AK. Easy to play against — just fold when he shows aggression.',added:'2026-01-18'},
  {id:5004,name:'The Aggro Kid',venue:'Metro Card Club',tags:['loose','aggressive','maniac'],notes:'23-25 years old, plays every pot. Cbets 100% flops, gives up on turns. Float and take it away. Does not handle pressure well short-stacked.',added:'2025-12-28'},
  {id:5005,name:'Sunglasses Lady',venue:'Casino Filipino',tags:['tight','reg'],notes:'Solid regular at Casino Filipino. Position aware, rarely bluffs. If she calls your 3-bet she has a hand. Respect her river bets.',added:'2025-11-08'}
];

var _demoStrategies = [{
  id:4001,week:'Week of March 22, 2026',
  topic:'Blind vs Blind Limping Strategies',
  note:'In SB vs BB spots at 20-60BB, GTO dictates limping 56-75% of hands including premiums. Because BB has a wide uncapped checking range, SB must protect by checking flop at high frequency (55-75%) especially on low connected boards. In live PH MTTs, BB players over-fold to raises but call down postflop with wide ranges — adjust by limping more, checking more flops, and value betting large when you connect.',
  type:'gemini'
}];

var _demoBankroll = {amount:18500, rule:15};
var _demoWallet = {balance:32000};
var _demoWalletLedger = [
  {id:9601,date:'2026-03-14',type:'deposit',amount:25000,notes:'Cash added before Metro Sunday Main',walletDelta:25000,bankrollDelta:0,walletBalanceAfter:25000,bankrollBalanceAfter:18500},
  {id:9602,date:'2026-03-14',type:'bankroll_topup',amount:10000,notes:'Loaded bankroll for weekend slate',walletDelta:-10000,bankrollDelta:10000,walletBalanceAfter:15000,bankrollBalanceAfter:28500},
  {id:9603,date:'2026-03-19',type:'expense',amount:3000,notes:'Hotel and transport',walletDelta:-3000,bankrollDelta:0,walletBalanceAfter:12000,bankrollBalanceAfter:18500}
];
var _demoSatTarget = {name:'Okada Manila Millions Main Event', buyin:7500};

function initDemoModeFeature() {}

function loadDemoMode() {
  if (!confirm('This will load sample data so you can explore PokerHQ.\n\nYour real data is safe and will not be affected.')) return;
  window._demoMode = true;
  clearActiveSessionDraft();
  window.sessions   = _demoSessions.slice();
  window.tourneys   = _demoTourneys.slice();
  window.hands      = _demoHands.slice();
  window.strategies = _demoStrategies.slice();
  window.satellites = _demoSatellites.slice();
  window.opponents  = _demoOpponents.slice();
  window.bankroll   = Object.assign({}, _demoBankroll);
  window.wallet     = Object.assign({}, _demoWallet);
  window.walletLedger = _demoWalletLedger.slice();
  sessions   = window.sessions;
  tourneys   = window.tourneys;
  hands      = window.hands;
  strategies = window.strategies;
  bankroll   = window.bankroll;
  wallet     = window.wallet;
  walletLedger = window.walletLedger;
  satellites = window.satellites;
  opponents  = window.opponents;
  satTarget  = Object.assign({}, _demoSatTarget);
  var badge = document.getElementById('demo-badge');
  var clearBtn = document.getElementById('demo-clear-btn');
  if (badge) badge.classList.add('visible');
  if (clearBtn) clearBtn.classList.add('visible');
  if (typeof _calYear !== 'undefined') { _calYear = 2026; _calMonth = 3; }
  switchGroup('home');
  refreshDashboard();
  renderCalendarMonth();
  renderCalendarList();
  renderHands();
  if (window.renderSatellites) renderSatellites();
  if (window.renderOpponents) renderOpponents();
  renderStrategy();
  renderHeatmap();
  loadBankrollForm();
  if (typeof renderTreasury === 'function') renderTreasury();
  populateSessionDropdowns();
  renderActiveSessionSurface();
  renderReliability();
}

function clearDemoMode() {
  window._demoMode = false;
  clearActiveSessionDraft();
  window.sessions   = load('sessions', []);
  window.tourneys   = load('tourneys', []);
  window.hands      = load('hands', []);
  window.strategies = load('strategies', []);
  window.satellites = load('satellites', []);
  window.opponents  = load('opponents', []);
  window.bankroll   = load('bankroll', {amount:0, rule:15});
  window.wallet     = load('wallet', {balance:0});
  window.walletLedger = load('walletLedger', []);
  sessions   = window.sessions;
  tourneys   = window.tourneys;
  hands      = window.hands;
  strategies = window.strategies;
  bankroll   = window.bankroll;
  wallet     = window.wallet;
  walletLedger = window.walletLedger;
  satellites = window.satellites;
  opponents  = window.opponents;
  satTarget  = load('satTarget', {name:'',buyin:0});
  var badge = document.getElementById('demo-badge');
  var clearBtn = document.getElementById('demo-clear-btn');
  if (badge) badge.classList.remove('visible');
  if (clearBtn) clearBtn.classList.remove('visible');
  if (window.fbLoadAll) window.fbLoadAll();
  refreshDashboard();
  renderCalendarMonth();
  renderCalendarList();
  renderHands();
  if (window.renderSatellites) renderSatellites();
  if (window.renderOpponents) renderOpponents();
  renderStrategy();
  renderHeatmap();
  loadBankrollForm();
  if (typeof renderTreasury === 'function') renderTreasury();
  renderActiveSessionSurface();
  renderReliability();
}

function onboardingLoadDemo() {
  loadDemoMode();
  dismissOnboarding();
}

function refreshDemoBanner() {
  var banner = document.getElementById('demo-banner');
  if (!banner) return;
  var dismissed = readDemoBannerDismissed();
  banner.style.display = (!window._demoMode && !dismissed) ? 'flex' : 'none';
  renderReliability();
}

function dismissDemoBanner() {
  localStorage.setItem(getDemoBannerStorageKey(), '1');
  var banner = document.getElementById('demo-banner');
  if (banner) banner.style.display = 'none';
}
