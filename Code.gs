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

function doGet() {
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
