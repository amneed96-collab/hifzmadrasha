# হিফয মাদরাসা ব্যবস্থাপনা সফটওয়্যার

ফ্রন্টএন্ড থাকে **GitHub Pages**-এ, আর সব ডেটা জমা হয় আপনার **Google Sheet**-এ (Google Apps Script মাঝখানে যোগাযোগ করে)।

ফাইল: `index.html` · `config.js` · `Code.gs` (এটি GitHub-এ না দিলেও চলে, Apps Script-এ বসাতে হবে)

## ধাপ ১ — Google Sheet ও Apps Script

1. [sheets.google.com](https://sheets.google.com) এ একটি নতুন Google Sheet খুলুন (নাম: “মাদরাসা ডেটা”)।
2. মেনু থেকে **Extensions → Apps Script** চাপুন।
3. এডিটরে আগের সব কোড মুছে `Code.gs` ফাইলের পুরো লেখা বসান।
4. কোডের উপরে `const PASSWORD = 'madrasa123';` লাইনে **নিজের পাসওয়ার্ড** দিন। (এই পাসওয়ার্ড দিয়েই সফটওয়্যারে ঢুকবেন।)
5. **Save** করুন। উপরের ফাংশন তালিকা থেকে `setup` নির্বাচন করে **Run** চাপুন। অনুমতি চাইলে আপনার Google অ্যাকাউন্ট নির্বাচন করে **Allow** দিন (“Advanced → Go to … (unsafe)” দেখালে সেটি চাপুন, এটি আপনার নিজের স্ক্রিপ্ট)।
   এতে Sheet-এ Students, FeeCollections, FeeRules, Staff, Salaries, Expenses, Settings ও Files ট্যাব তৈরি হবে।
6. **Deploy → New deployment → Select type: Web app** চাপুন:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy** চাপুন এবং যে **Web app URL** (`https://script.google.com/macros/s/.../exec`) পাবেন সেটি কপি করুন।

> পরে `Code.gs` বদলালে **Deploy → Manage deployments → Edit → New version → Deploy** করতে হবে।

## ধাপ ২ — config.js

`config.js` খুলে `PASTE_WEB_APP_URL_HERE` এর জায়গায় কপি করা লিংকটি বসান:

```js
const CFG = {
  API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec'
};
```

## ধাপ ৩ — GitHub-এ আপলোড

1. [github.com](https://github.com) এ নতুন Repository খুলুন (যেমন `madrasa`)।
2. **Add file → Upload files** দিয়ে `index.html` ও `config.js` আপলোড করে **Commit** করুন।
3. **Settings → Pages → Build and deployment**: Source = **Deploy from a branch**, Branch = **main**, Folder = **/(root)** → **Save**।
4. ১–২ মিনিট পর লিংক পাবেন: `https://আপনার-ইউজারনেম.github.io/madrasa/`

## ধাপ ৪ — চালানো

লিংকটি খুলে Apps Script-এ দেওয়া পাসওয়ার্ড লিখে প্রবেশ করুন। তারপর:

1. **ব্যবস্থাপনা → প্রতিষ্ঠান সেটাপ** পূরণ করুন (নাম, লোগো, অঙ্গীকারনামা, অনুমোদনের লেখা ইত্যাদি)।
2. **ফি নির্ধারণ** পেজে ফি ঠিক করে সংরক্ষণ করুন।
3. এরপর ভর্তি ও ফি আদায় শুরু করুন।

## আইডি কার্ডের QR কোড

আইডি কার্ডের পেছনে যে QR কোড থাকে সেটি একটি লিংক — কার্ড হাতে পাওয়ার পর শিক্ষার্থী বা অভিভাবক **যেকোনো সময়** স্ক্যান করলে ওই মুহূর্তের সবশেষ হিসাব (কোন খাতে কত বকেয়া, কত পরিশোধ) সরাসরি Google Sheet থেকে দেখতে পাবেন। প্রিন্ট করা কার্ডে কোনো তথ্য জমা থাকে না, প্রতিবার স্ক্যানেই নতুন করে হিসাব বের হয়।

এটি কাজ করতে:
1. **প্রতিষ্ঠান সেটাপ** পেজে "আইডি কার্ড QR — যাচাই কোড" ঘরে একটি কোড এমনিতেই বসানো থাকবে। **সংরক্ষণ করুন** চাপলে সেটি সক্রিয় হবে।
2. `Code.gs` বদলানোর পর অবশ্যই আবার **Deploy → Manage deployments → Edit → New version → Deploy** করুন, নাহলে QR লিংক কাজ করবে না।
3. "নতুন কোড তৈরি" চাপলে আগের সব ছাপানো কার্ডের QR অকার্যকর হয়ে যাবে (কার্ড হারিয়ে গেলে বা নিরাপত্তার জন্য এটি ব্যবহার করুন), নতুন কার্ড ছাপাতে হবে।

## জেনে রাখুন

- পাসওয়ার্ড শুধু Apps Script-এ থাকে, GitHub-এ নয়। তবু Repository যেন কারও সঙ্গে অপ্রয়োজনে শেয়ার না হয় সেদিকে খেয়াল রাখুন।
- ছবি, জন্ম নিবন্ধন ও এনআইডি Google Sheet-এর `Files` ট্যাবে টুকরো করে জমা হয়। সেই ট্যাব হাতে বদলাবেন না।
- অন্য Google অ্যাকাউন্টকে Sheet দেখতে দিতে চাইলে শুধু Sheet শেয়ার করুন, Apps Script ডিপ্লয় আপনার অ্যাকাউন্টেই থাকবে।
- ব্যাকআপ: Google Sheet-এ **File → Make a copy** করে রাখুন।
- Google Sheet-এ একটি শীটে সর্বোচ্চ ১ কোটি ঘর পর্যন্ত রাখা যায়, একটি মাদরাসার জন্য যা যথেষ্ট।
