/**
 * হিফয মাদরাসা ব্যবস্থাপনা — Google Apps Script ব্যাকএন্ড
 * এই কোড আপনার Google Sheet-এর Apps Script এডিটরে বসাতে হবে (README দেখুন)।
 * সব ডেটা ওই Sheet-এর আলাদা আলাদা ট্যাবে জমা হয়।
 */

// ▼▼ এই পাসওয়ার্ডটি অবশ্যই বদলে নিন ▼▼
const PASSWORD = 'madrasa123';
// ▲▲ ------------------------------ ▲▲

const NAMES = {
  students: 'Students',
  collections: 'FeeCollections',
  feeRules: 'FeeRules',
  staff: 'Staff',
  salaries: 'Salaries',
  expenses: 'Expenses',
  notices: 'Notices',
  certificates: 'Certificates',
  settings: 'Settings'
};
// বড় ছবি/স্বাক্ষর যেসব ঘরে থাকে সেগুলো আলাদা "Files" ট্যাবে টুকরো করে রাখা হয়
const HEAVY = ['sigStu', 'sigGua', 'sigHead', 'sigDir', 'birthCert', 'fNid', 'mNid',
               'sig', 'dirSig', 'sigCash', 'sigRec', 'directorSig'];
const CHUNK = 40000; // Google Sheet-এর এক ঘরে সর্বোচ্চ ৫০,০০০ অক্ষর

function SS() { return SpreadsheetApp.getActiveSpreadsheet(); }

/** একবার হাতে চালান: সব ট্যাব তৈরি করে ও অনুমতি নেয়। */
function setup() {
  Object.keys(NAMES).forEach(function (t) { sheet(t); });
  filesSheet();
  return 'OK';
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.i) {
    return HtmlService.createHtmlOutput(studentStatusPage(p.i, p.k))
      .setTitle('ফি হিসাব')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return ContentService.createTextOutput('মাদরাসা ব্যাকএন্ড চালু আছে');
}

function doPost(e) {
  var out;
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.key !== PASSWORD) throw new Error('AUTH');
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { out = { ok: true, data: route(p) }; }
    finally { lock.releaseLock(); }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function route(p) {
  switch (p.action) {
    case 'ping': return true;
    case 'list': return listAll();
    case 'getFiles': return getFiles(p.table, p.id);
    case 'batch':
      (p.ops || []).forEach(function (op) {
        if (op.op === 'upsert') upsert(op.table, op.rec);
        else if (op.op === 'delete') del(op.table, op.id);
      });
      return true;
  }
  throw new Error('অজানা অ্যাকশন');
}

/* ---------- sheet helpers ---------- */
function sheet(t) {
  var name = NAMES[t];
  if (!name) throw new Error('অবৈধ টেবিল: ' + t);
  var s = SS().getSheetByName(name);
  if (!s) {
    s = SS().insertSheet(name);
    s.appendRow(['id']);
    s.setFrozenRows(1);
  }
  return s;
}
function filesSheet() {
  var s = SS().getSheetByName('Files');
  if (!s) {
    s = SS().insertSheet('Files');
    s.appendRow(['key', 'idx', 'data']);
    s.setFrozenRows(1);
  }
  return s;
}
function headers(s) {
  var n = s.getLastColumn();
  if (!n) { s.getRange(1, 1).setValue('id'); return ['id']; }
  return s.getRange(1, 1, 1, n).getValues()[0].map(String);
}
function readTable(t) {
  var s = sheet(t), v = s.getDataRange().getValues();
  if (v.length < 2) return [];
  var h = v[0], out = [], tz = Session.getScriptTimeZone();
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    var o = {};
    for (var j = 0; j < h.length; j++) {
      if (!h[j]) continue;
      var x = v[i][j];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      o[h[j]] = (x === null || x === undefined) ? '' : x;
    }
    out.push(o);
  }
  return out;
}
function listAll() {
  var out = {};
  Object.keys(NAMES).forEach(function (t) {
    if (t === 'settings') return;
    out[t] = readTable(t);
  });
  var st = readTable('settings')[0] || {};
  var f = getFiles('settings', 'main');
  Object.keys(f).forEach(function (k) { st[k] = f[k]; });
  out.settings = st;
  return out;
}

/* ---------- write ---------- */
function upsert(t, rec) {
  if (!rec || !rec.id) throw new Error('id নেই');
  var s = sheet(t), h = headers(s);
  Object.keys(rec).forEach(function (k) {
    if (h.indexOf(k) < 0) { h.push(k); s.getRange(1, h.length).setValue(k); }
  });
  var last = s.getLastRow(), row = -1;
  if (last >= 2) {
    var ids = s.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(rec.id)) { row = i + 2; break; }
    }
  }
  var isNew = row < 0;
  if (isNew) row = Math.max(last, 1) + 1;
  var cur = isNew ? h.map(function () { return ''; }) : s.getRange(row, 1, 1, h.length).getValues()[0];
  for (var j = 0; j < h.length; j++) {
    var k = h[j];
    if (!(k in rec)) continue;
    var val = rec[k];
    if (HEAVY.indexOf(k) >= 0) {
      var key = t + ':' + rec.id + ':' + k;
      if (typeof val === 'string' && val.indexOf('data:') === 0) { saveFile(key, val); val = '@'; }
      else if (val === '@') { /* অপরিবর্তিত */ }
      else { delFilesWhere(function (x) { return x === key; }); val = ''; }
    } else if (val !== null && typeof val === 'object') {
      val = JSON.stringify(val);
    }
    cur[j] = (val === null || val === undefined) ? '' : String(val);
  }
  var rg = s.getRange(row, 1, 1, h.length);
  rg.setNumberFormat('@');      // তারিখ/ফোন নম্বর যেন বদলে না যায়
  rg.setValues([cur]);
}

function del(t, id) {
  var s = sheet(t), last = s.getLastRow();
  if (last >= 2) {
    var ids = s.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) { s.deleteRow(i + 2); break; }
    }
  }
  var prefix = t + ':' + id + ':';
  delFilesWhere(function (x) { return x.indexOf(prefix) === 0; });
}

/* ---------- files (বড় ছবি) ---------- */
function saveFile(key, data) {
  delFilesWhere(function (x) { return x === key; });
  var s = filesSheet(), rows = [];
  for (var i = 0, n = 0; i < data.length; i += CHUNK, n++) {
    rows.push([key, String(n), data.substr(i, CHUNK)]);
  }
  if (!rows.length) return;
  var r = s.getLastRow() + 1, rg = s.getRange(r, 1, rows.length, 3);
  rg.setNumberFormat('@');
  rg.setValues(rows);
}
function delFilesWhere(pred) {
  var s = filesSheet(), last = s.getLastRow();
  if (last < 2) return;
  var keys = s.getRange(2, 1, last - 1, 1).getValues(), rows = [];
  for (var i = 0; i < keys.length; i++) if (pred(String(keys[i][0]))) rows.push(i + 2);
  for (var a = rows.length - 1; a >= 0;) {
    var b = a;
    while (b > 0 && rows[b - 1] === rows[b] - 1) b--;
    s.deleteRows(rows[b], a - b + 1);
    a = b - 1;
  }
}
function getFiles(t, id) {
  var s = filesSheet(), last = s.getLastRow(), out = {};
  if (last < 2) return out;
  var v = s.getRange(2, 1, last - 1, 3).getValues(), prefix = t + ':' + id + ':', parts = {};
  v.forEach(function (r) {
    var k = String(r[0]);
    if (k.indexOf(prefix) !== 0) return;
    var f = k.slice(prefix.length);
    (parts[f] = parts[f] || []).push([Number(r[1]), String(r[2])]);
  });
  Object.keys(parts).forEach(function (f) {
    out[f] = parts[f].sort(function (a, b) { return a[0] - b[0]; })
      .map(function (x) { return x[1]; }).join('');
  });
  return out;
}

/* ---------- public read-only status page (QR code on ID cards) ---------- */
var BND_ = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
function bnD(v) { return String(v == null ? '' : v).replace(/\d/g, function (d) { return BND_[+d]; }); }
function escH(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
var MONTHS_ = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
function fdateH(d) { return d ? bnD(String(d).slice(0, 10).split('-').reverse().join('/')) : ''; }
function fmonthH(m) { return m ? MONTHS_[(+String(m).slice(5, 7)) - 1] + ' ' + bnD(String(m).slice(0, 4)) : ''; }
function tkH(n) {
  var r = Math.round((+n || 0) * 100) / 100;
  return bnD(r.toLocaleString('en-US')) + ' ৳';
}
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function todayYM_() {
  var d = new Date(), tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'yyyy-MM');
}
function monthsBetween_(a, b) {
  var out = [], ay = +a.slice(0, 4), am = +a.slice(5, 7), by = +b.slice(0, 4), bm = +b.slice(5, 7);
  while (ay < by || (ay === by && am <= bm)) {
    out.push(ay + '-' + pad2_(am)); am++; if (am > 12) { am = 1; ay++; }
  }
  return out;
}
function feeAmount_(rule, month) {
  var a = 0, hist = (rule.history || []).slice().sort(function (x, y) { return x.from < y.from ? -1 : 1; });
  hist.forEach(function (h) { if (h.from <= month) a = Number(h.amount) || 0; });
  return a;
}
function rulesFor_(rules, s) {
  return rules.filter(function (r) {
    return (r.dept === 'সকল' || r.dept === s.dept) && (r.type === 'সকল' || r.type === s.type);
  });
}
function studentDues_(rules, collections, s, month) {
  var start = String(s.admDate).slice(0, 7), res = {};
  var ms = start <= month ? monthsBetween_(start, month) : [];
  rulesFor_(rules, s).forEach(function (r) {
    res[r.head] = res[r.head] || { acc: 0, paid: 0 };
    if (!ms.length) return;
    if (r.freq === 'once') { res[r.head].acc += feeAmount_(r, start); }
    else if (r.freq === 'event') {
      (r.history || []).forEach(function (h) { if (h.from >= start && h.from <= month) res[r.head].acc += Number(h.amount) || 0; });
    } else {
      ms.forEach(function (m) { res[r.head].acc += feeAmount_(r, m); });
    }
  });
  collections.forEach(function (c) {
    if (c.studentId !== s.id || c.month > month) return;
    (c.lines || []).forEach(function (l) {
      res[l.head] = res[l.head] || { acc: 0, paid: 0 };
      res[l.head].paid += (+l.paid || 0);
    });
  });
  return res;
}
function parseJSONArr_(x) { try { return x ? (typeof x === 'string' ? JSON.parse(x) : x) : []; } catch (e) { return []; } }

/** id কার্ডের QR থেকে খোলা পাবলিক ফি-হিসাব পেজ। */
function studentStatusPage(sid, key) {
  var css = 'body{font-family:"Noto Sans Bengali",system-ui,sans-serif;background:#E9F1F7;color:#10212E;margin:0;padding:16px;font-size:15px}' +
    '.card{max-width:480px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.12)}' +
    '.hd{background:#0A3D62;color:#fff;padding:16px;display:flex;align-items:center;gap:10px}' +
    '.hd img{height:42px;width:42px;border-radius:50%;background:#fff;object-fit:cover}' +
    '.hd b{font-size:17px;display:block}.hd small{opacity:.85}' +
    '.bd{padding:16px}table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:13.5px}' +
    'th,td{border:1px solid #CBDCE8;padding:6px 8px;text-align:left}th{background:#EEF5FA;color:#0A3D62}' +
    'td.n,th.n{text-align:right}.tot{font-weight:700;background:#EEF5FA}' +
    '.warn{background:#FBEDEA;color:#B3392B;padding:10px;border-radius:6px;text-align:center;margin:20px 0}' +
    '.upd{color:#56707F;font-size:12px;text-align:center;margin-top:10px}' +
    '.cr{text-align:center;font-size:11px;color:#8AA;margin-top:14px}';
  var page = function (body) {
    return '<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><style>' + css + '</style></head><body><div class="card">' + body + '</div></body></html>';
  };
  var st = readTable('settings')[0] || {};
  var files = getFiles('settings', 'main');
  var logo = files.logo || '';
  var headHTML = '<div class="hd">' + (logo ? '<img src="' + logo + '">' : '') +
    '<div><b>' + escH(st.name || 'প্রতিষ্ঠান') + '</b>' + (st.address ? '<small>' + escH(st.address) + '</small>' : '') + '</div></div>';

  if (!sid) return page(headHTML + '<div class="bd"><div class="warn">আইডি পাওয়া যায়নি</div></div>');
  if (!st.viewKey || key !== st.viewKey) return page(headHTML + '<div class="bd"><div class="warn">অবৈধ বা মেয়াদোত্তীর্ণ লিংক</div></div>');

  var students = readTable('students');
  var s = null;
  for (var i = 0; i < students.length; i++) { if (String(students[i].sid) === String(sid)) { s = students[i]; break; } }
  if (!s) return page(headHTML + '<div class="bd"><div class="warn">এই আইডির শিক্ষার্থী পাওয়া যায়নি</div></div>');

  var rules = readTable('feeRules').map(function (r) { r.history = parseJSONArr_(r.history); return r; });
  var collections = readTable('collections').map(function (c) { c.lines = parseJSONArr_(c.lines); return c; });
  var cm = todayYM_();
  var dues = studentDues_(rules, collections, s, cm);
  var heads = Object.keys(dues).filter(function (h) { return dues[h].acc || dues[h].paid; });
  var totalPaid = 0, totalDue = 0;
  var rows = heads.map(function (h) {
    var x = dues[h], rem = x.acc - x.paid;
    totalPaid += x.paid; totalDue += rem;
    return '<tr><td>' + escH(h) + '</td><td class="n">' + tkH(x.acc) + '</td><td class="n">' + tkH(x.paid) + '</td><td class="n">' + tkH(rem) + '</td></tr>';
  }).join('');

  var info = '<table><tr><th>আইডি</th><td>' + bnD(s.sid) + '</td></tr>' +
    '<tr><th>নাম</th><td>' + escH(s.name) + '</td></tr>' +
    '<tr><th>বিভাগ</th><td>' + escH(s.dept) + ' (' + escH(s.type) + ')</td></tr>' +
    '<tr><th>অভিভাবক</th><td>' + escH(s.gName || s.fName || '') + (s.gMobile || s.fMobile ? ' — ' + bnD(s.gMobile || s.fMobile) : '') + '</td></tr>' +
    '<tr><th>ভর্তির তারিখ</th><td>' + fdateH(s.admDate) + '</td></tr></table>';

  var feeTable = rows
    ? '<table><tr><th>খাত</th><th class="n">মোট প্রাপ্য</th><th class="n">পরিশোধ</th><th class="n">বকেয়া</th></tr>' + rows +
      '<tr class="tot"><td>সর্বমোট</td><td class="n">' + tkH(totalPaid + totalDue) + '</td><td class="n">' + tkH(totalPaid) + '</td><td class="n">' + tkH(totalDue) + '</td></tr></table>'
    : '<p style="text-align:center;color:#56707F">কোনো ফি নির্ধারিত নেই</p>';

  var updated = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy hh:mm a");
  var body = '<div class="bd">' + info + '<h3 style="color:#0A3D62;margin:14px 0 6px">' + fmonthH(cm) + ' পর্যন্ত হিসাব</h3>' + feeTable +
    '<div class="upd">সর্বশেষ হালনাগাদ: ' + updated + '</div><div class="cr">@AM Shahed: 01605721296</div></div>';
  return page(headHTML + body);
}
