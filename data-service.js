import { db } from './firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, addDoc, doc,
  updateDoc, deleteDoc, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ---------------------------------------------------------------------------
   Cloudinary configuration — fill these two values from your Cloudinary console
   --------------------------------------------------------------------------- */

const CLOUDINARY_CLOUD_NAME    = 'YOUR_CLOUD_NAME';      // e.g. 'dxxxxxx'
const CLOUDINARY_UPLOAD_PRESET = 'YOUR_UPLOAD_PRESET';   // e.g. 'tpa_unsigned'

/* ---------------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------------- */

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  'Federal Capital Territory'
];

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

function toISO(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') return ts;
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate().toISOString(); } catch { return null; }
  }
  return null;
}

/* ---------------------------------------------------------------------------
   News
   --------------------------------------------------------------------------- */

function mapNews(d) {
  const data = d.data();
  return {
    id: d.id,
    title: data.title || '',
    date: data.date || '',
    category: data.category || '',
    snippet: data.snippet || '',
    body: data.body || '',
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt)
  };
}

export async function fetchNews(max = null) {
  const constraints = [orderBy('date', 'desc'), orderBy('createdAt', 'desc')];
  if (max) constraints.push(limit(max));
  const q = query(collection(db, 'news'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(mapNews);
}

export async function fetchNewsById(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, 'news', id));
  if (!snap.exists()) return null;
  return mapNews(snap);
}

export async function createNews(newsData) {
  const payload = {
    title: newsData.title,
    date: newsData.date,
    category: newsData.category,
    snippet: newsData.snippet,
    body: newsData.body,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'news'), payload);
  return refDoc.id;
}

export async function updateNews(id, newsData) {
  const payload = {
    title: newsData.title,
    date: newsData.date,
    category: newsData.category,
    snippet: newsData.snippet,
    body: newsData.body,
    updatedAt: serverTimestamp()
  };
  await updateDoc(doc(db, 'news', id), payload);
}

export async function deleteNews(id) {
  await deleteDoc(doc(db, 'news', id));
}

/* ---------------------------------------------------------------------------
   National Execos
   --------------------------------------------------------------------------- */

function mapExeco(d) {
  const data = d.data();
  return {
    id: d.id,
    name: data.name || '',
    role: data.role || '',
    photoUrl: data.photoUrl || null,
    photoPath: data.photoPath || null,
    photoDeleteToken: data.photoDeleteToken || null,
    displayOrder: typeof data.displayOrder === 'number' ? data.displayOrder : 0,
    createdAt: toISO(data.createdAt)
  };
}

export async function fetchNationalExecos() {
  const snap = await getDocs(collection(db, 'national_execos'));
  const items = snap.docs.map(mapExeco);
  items.sort((a, b) => {
    const ao = Number(a.displayOrder) || 0;
    const bo = Number(b.displayOrder) || 0;
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  return items;
}

export async function createExeco(execoData) {
  const payload = {
    name: execoData.name,
    role: execoData.role,
    photoUrl: execoData.photoUrl || null,
    photoPath: execoData.photoPath || null,
    photoDeleteToken: execoData.photoDeleteToken || null,
    displayOrder: Number(execoData.displayOrder) || 0,
    createdAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'national_execos'), payload);
  return refDoc.id;
}

export async function updateExeco(id, execoData) {
  const payload = {
    name: execoData.name,
    role: execoData.role,
    photoUrl: execoData.photoUrl || null,
    photoPath: execoData.photoPath || null,
    photoDeleteToken: execoData.photoDeleteToken || null,
    displayOrder: Number(execoData.displayOrder) || 0
  };
  await updateDoc(doc(db, 'national_execos', id), payload);
}

export async function updateExecoOrder(id, displayOrder) {
  await updateDoc(doc(db, 'national_execos', id), {
    displayOrder: Number(displayOrder) || 0
  });
}

export async function deleteExeco(id) {
  const docRef = doc(db, 'national_execos', id);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};
  const publicId = data.photoPath || null;
  const deleteToken = data.photoDeleteToken || null;
  await deleteDoc(docRef);
  if (publicId && deleteToken) {
    await deleteCloudinaryImage(publicId, deleteToken);
  }
}

/* ---------------------------------------------------------------------------
   Board of Trustees — same shape as National Execos
   --------------------------------------------------------------------------- */

function mapTrustee(d) {
  const data = d.data();
  return {
    id: d.id,
    name: data.name || '',
    role: data.role || '',
    photoUrl: data.photoUrl || null,
    photoPath: data.photoPath || null,
    photoDeleteToken: data.photoDeleteToken || null,
    displayOrder: typeof data.displayOrder === 'number' ? data.displayOrder : 0,
    createdAt: toISO(data.createdAt)
  };
}

export async function fetchBoardOfTrustees() {
  const snap = await getDocs(collection(db, 'board_of_trustees'));
  const items = snap.docs.map(mapTrustee);
  items.sort((a, b) => {
    const ao = Number(a.displayOrder) || 0;
    const bo = Number(b.displayOrder) || 0;
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  return items;
}

export async function createTrustee(trusteeData) {
  const payload = {
    name: trusteeData.name,
    role: trusteeData.role,
    photoUrl: trusteeData.photoUrl || null,
    photoPath: trusteeData.photoPath || null,
    photoDeleteToken: trusteeData.photoDeleteToken || null,
    displayOrder: Number(trusteeData.displayOrder) || 0,
    createdAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'board_of_trustees'), payload);
  return refDoc.id;
}

export async function updateTrustee(id, trusteeData) {
  const payload = {
    name: trusteeData.name,
    role: trusteeData.role,
    photoUrl: trusteeData.photoUrl || null,
    photoPath: trusteeData.photoPath || null,
    photoDeleteToken: trusteeData.photoDeleteToken || null,
    displayOrder: Number(trusteeData.displayOrder) || 0
  };
  await updateDoc(doc(db, 'board_of_trustees', id), payload);
}

export async function updateTrusteeOrder(id, displayOrder) {
  await updateDoc(doc(db, 'board_of_trustees', id), {
    displayOrder: Number(displayOrder) || 0
  });
}

export async function deleteTrustee(id) {
  const docRef = doc(db, 'board_of_trustees', id);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : {};
  const publicId = data.photoPath || null;
  const deleteToken = data.photoDeleteToken || null;
  await deleteDoc(docRef);
  if (publicId && deleteToken) {
    await deleteCloudinaryImage(publicId, deleteToken);
  }
}

/* ---------------------------------------------------------------------------
   State Coordinators
   --------------------------------------------------------------------------- */

function mapCoord(d) {
  const data = d.data();
  return {
    id: d.id,
    name: data.name || '',
    state: data.state || '',
    lga: data.lga || '',
    createdAt: toISO(data.createdAt)
  };
}

export async function fetchStateCoordinators() {
  const snap = await getDocs(collection(db, 'state_coordinators'));
  const items = snap.docs.map(mapCoord);
  items.sort((a, b) => {
    const s = a.state.localeCompare(b.state);
    if (s !== 0) return s;
    return a.name.localeCompare(b.name);
  });
  return items;
}

export async function createCoordinator(coordData) {
  const payload = {
    name: coordData.name,
    state: coordData.state,
    lga: coordData.lga,
    createdAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'state_coordinators'), payload);
  return refDoc.id;
}

export async function deleteCoordinator(id) {
  await deleteDoc(doc(db, 'state_coordinators', id));
}

/**
 * Bulk-imports the given coordinator list, skipping any whose
 * (name, state) pair already exists. Returns a summary.
 */
export async function seedCoordinators(list) {
  const existing = await fetchStateCoordinators();
  const existingKeys = new Set(
    existing.map(c => `${c.name.trim().toLowerCase()}|${c.state.trim().toLowerCase()}`)
  );
  const summary = { added: 0, skipped: 0, errors: [] };
  for (const c of list) {
    const key = `${c.name.trim().toLowerCase()}|${c.state.trim().toLowerCase()}`;
    if (existingKeys.has(key)) {
      summary.skipped++;
      continue;
    }
    try {
      await createCoordinator({
        name: c.name,
        state: c.state,
        lga: c.lga
      });
      summary.added++;
    } catch (err) {
      summary.errors.push(`${c.name}: ${err.message}`);
    }
  }
  return summary;
}

/* ---------------------------------------------------------------------------
   Members — public registration + admin management
   --------------------------------------------------------------------------- */

function mapMember(d) {
  const data = d.data();
  return {
    id: d.id,
    fullName: data.fullName || '',
    email: data.email || '',
    phone: data.phone || '',
    state: data.state || '',
    status: data.status || 'pending',
    createdAt: toISO(data.createdAt)
  };
}

export async function createMember(memberData) {
  const payload = {
    fullName: memberData.fullName,
    email: memberData.email,
    phone: memberData.phone,
    state: memberData.state,
    status: 'pending',
    createdAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'members'), payload);
  return refDoc.id;
}

export async function fetchMembers() {
  const snap = await getDocs(collection(db, 'members'));
  const items = snap.docs.map(mapMember);
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return items;
}

export async function updateMemberStatus(id, status) {
  await updateDoc(doc(db, 'members', id), { status });
}

export async function deleteMember(id) {
  await deleteDoc(doc(db, 'members', id));
}

/* ---------------------------------------------------------------------------
   Auth / roles
   --------------------------------------------------------------------------- */

export async function checkAdmin(user) {
  if (!user) return false;
  const snap = await getDoc(doc(db, 'user_roles', user.uid));
  if (!snap.exists()) return false;
  return snap.data().role === 'admin';
}

/* ---------------------------------------------------------------------------
   Media — Cloudinary
   Photos are resized client-side before upload so Cloudinary stores tiny
   files and the site stays fast on slow connections.
   --------------------------------------------------------------------------- */

/**
 * Resize an image to fit within maxDim × maxDim (preserving aspect ratio)
 * and re-encode as JPEG at the given quality. GIFs are passed through
 * untouched so animation is not destroyed. If resizing fails or produces
 * a larger file, the original is returned.
 */
async function resizeImage(file, maxDim = 800, quality = 0.85) {
  // GIFs must not be resized — would destroy animation
  if (file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);

      const { width, height } = img;

      // Already small enough — keep original
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }

      const ratio = Math.min(maxDim / width, maxDim / height);
      const newW = Math.round(width * ratio);
      const newH = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, newW, newH);

      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const baseName = file.name.replace(/\.\w+$/, '') || 'photo';
        const resized = new File([blob], `${baseName}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        // Only use the resized version if it actually got smaller
        resolve(resized.size < file.size ? resized : file);
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(file);   // fall back to the original if anything fails
    };

    img.src = blobUrl;
  });
}

export async function uploadToStorage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be smaller than 5 MB.');
  }

  // Resize client-side: max 800×800, JPEG quality 0.85
  // Typical result: 4 MB phone photo → ~80–150 KB
  const toUpload = await resizeImage(file, 800, 0.85);

  const formData = new FormData();
  formData.append('file', toUpload);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const res = await fetch(url, { method: 'POST', body: formData });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloudinary upload failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    url: data.secure_url,
    path: data.public_id,
    deleteToken: data.delete_token || null
  };
}

export async function deleteStorageFile(publicId, deleteToken) {
  if (!publicId || !deleteToken) return;
  try {
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('delete_token', deleteToken);

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`;
    const res = await fetch(url, { method: 'POST', body: formData });
    if (!res.ok) {
      console.warn('Cloudinary delete returned', res.status);
    }
  } catch (err) {
    console.warn('Cloudinary cleanup failed for', publicId, err);
  }
}

async function deleteCloudinaryImage(publicId, deleteToken) {
  await deleteStorageFile(publicId, deleteToken);
}