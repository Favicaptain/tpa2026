# Tinubu Progressive Advocates (TPA) — Website

A complete, production-ready static website for **Tinubu Progressive Advocates (TPA)** — a Nigerian political advocacy organisation focused on grassroots mobilisation, youth development through football, and national integration. The flagship initiative is **Five Million Footballs** (5 million footballs distributed across all 36 states + the FCT).

Tagline: **UNITY . PROGRESS . SERVICE**

---

## Tech stack

- **Frontend:** Vanilla HTML5 + CSS3 + ES module JavaScript (no framework, no build step)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication (email + password)
- **Images:** Cloudinary (unsigned upload preset — no server, no billing details)
- **Hosting:** Firebase Hosting
- **Fonts:** Google Fonts — Playfair Display (600, 700) + Inter (400, 500, 600, 700, 800)
- **Icons:** Font Awesome 6.5.1 (CDN)
- **Firebase SDK:** v10.12.0 (ESM CDN)

**Spark (free) plan for Firebase — no billing account needed. Cloudinary free tier — no billing details needed either.** No Cloud Functions, no Admin SDK, no custom claims. Admin access is granted purely via a `user_roles/{uid}` Firestore document.

> **Why Cloudinary for images?** Firebase's Cloud Storage for Firebase now requires the Blaze (pay-as-you-go) plan for *any* use — the Spark plan no longer includes Storage access. To keep the project 100% free and billing-free, images are uploaded directly from the browser to Cloudinary using an unsigned upload preset, and only the resulting URL is stored in Firestore.

---

## Setup steps

### Part A — Firebase (Firestore + Auth + Hosting)

1. **Create a Firebase project.** Go to <https://console.firebase.google.com> → **Add project**.
2. Enable **Build → Firestore Database** → *Create database* → start in **Production mode** → choose a region close to Nigeria (e.g. `europe-west1` or `us-central1`).
3. Enable **Build → Authentication** → *Get started* → enable **Email/Password**.
4. Register a **Web app** (`</>`) under *Project settings → Your apps*. Copy the `firebaseConfig` object and paste it into `firebase-config.js`.
5. **Publish Firestore rules:** paste the contents of `firestore.rules` into *Firestore Database → Rules* → **Publish** (or `firebase deploy --only firestore:rules` with the CLI).
6. **Create the first admin user:**
   - *Authentication → Users → Add user* — enter email/password. Copy the new user's UID.
   - *Firestore Database → Start collection* — Collection ID: `user_roles`, Document ID: *paste the UID*, add field `role` (string) = `"admin"`. Save.
7. Add **`logo.png`** to the project root.

### Part B — Cloudinary (image uploads, ~5 minutes, no card)

1. Go to <https://cloudinary.com> → **Sign up for free** → verify your email.
2. On the Dashboard, copy your **Cloud name** (top-left, under your account name).
3. Go to **Settings (⚙️) → Upload** → scroll to **Upload presets** → click **Add upload preset**.
4. Configure the preset:
   - **Preset name:** e.g. `tpa_unsigned` (lowercase, no spaces).
   - **Signing Mode:** **Unsigned**.
   - Scroll to **Advanced Options** → set **Return delete token** to **YES**.
   - **Save**.
5. Open `data-service.js` and replace the two placeholders near the top:
   ```javascript
   const CLOUDINARY_CLOUD_NAME    = 'YOUR_CLOUD_NAME';      // e.g. 'dxxxxxx'
   const CLOUDINARY_UPLOAD_PRESET = 'YOUR_UPLOAD_PRESET';   // e.g. 'tpa_unsigned'