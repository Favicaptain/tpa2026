import { db } from './firebase-config.js';
import {
  collection, query, orderBy, limit, getDocs, addDoc, doc,
  updateDoc, deleteDoc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ---------------------------------------------------------------------------
   Cloudinary configuration — fill these two values from your Cloudinary console
   --------------------------------------------------------------------------- */

const CLOUDINARY_CLOUD_NAME    = 'th1ixgex';      // e.g. 'dxxxxxx'
const CLOUDINARY_UPLOAD_PRESET = 'tpa_unsigned';   // e.g. 'tpa_unsigned'

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

/** Valid keys for the site_settings/{"roleKey"} leadership documents */
const LEADERSHIP_ROLES = ['national_leader', 'custodian'];

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
   Site leadership — single, fixed documents in site_settings
   ("national_leader" and "custodian"). Both use the same shape.
   --------------------------------------------------------------------------- */

function mapLeadership(data) {
  return {
    name: data.name || '',
    role: data.role || '',
    photoUrl: data.photoUrl || null,
    photoPath: data.photoPath || null,
    photoDeleteToken: data.photoDeleteToken || null
  };
}

/**
 * Load one of the fixed leadership slots.
 * @param {'national_leader'|'custodian'} roleKey
 * @returns {Promise<{name,role,photoUrl,photoPath,photoDeleteToken}|null>}
 */
export async function fetchLeadership(roleKey) {
  if (!LEADERSHIP_ROLES.includes(roleKey)) return null;
  const snap = await getDoc(doc(db, 'site_settings', roleKey));
  if (!snap.exists()) return null;
  return mapLeadership(snap.data());
}

/**
 * Save one of the fixed leadership slots.
 * Creates the document on first save, updates it thereafter.
 * @param {'national_leader'|'custodian'} roleKey
 */
export async function updateLeadership(roleKey, payload) {
  if (!LEADERSHIP_ROLES.includes(roleKey)) {
    throw new Error('Unknown leadership role: ' + roleKey);
  }
  const clean = {
    name: payload.name || '',
    role: payload.role || '',
    photoUrl: payload.photoUrl || null,
    photoPath: payload.photoPath || null,
    photoDeleteToken: payload.photoDeleteToken || null,
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'site_settings', roleKey), clean, { merge: true });
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
   Patrons — same shape as Board of Trustees
   --------------------------------------------------------------------------- */

function mapPatron(d) {
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

export async function fetchPatrons() {
  const snap = await getDocs(collection(db, 'patrons'));
  const items = snap.docs.map(mapPatron);
  items.sort((a, b) => {
    const ao = Number(a.displayOrder) || 0;
    const bo = Number(b.displayOrder) || 0;
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  return items;
}

export async function createPatron(patronData) {
  const payload = {
    name: patronData.name,
    role: patronData.role,
    photoUrl: patronData.photoUrl || null,
    photoPath: patronData.photoPath || null,
    photoDeleteToken: patronData.photoDeleteToken || null,
    displayOrder: Number(patronData.displayOrder) || 0,
    createdAt: serverTimestamp()
  };
  const refDoc = await addDoc(collection(db, 'patrons'), payload);
  return refDoc.id;
}

export async function updatePatron(id, patronData) {
  const payload = {
    name: patronData.name,
    role: patronData.role,
    photoUrl: patronData.photoUrl || null,
    photoPath: patronData.photoPath || null,
    photoDeleteToken: patronData.photoDeleteToken || null,
    displayOrder: Number(patronData.displayOrder) || 0
  };
  await updateDoc(doc(db, 'patrons', id), payload);
}

export async function updatePatronOrder(id, displayOrder) {
  await updateDoc(doc(db, 'patrons', id), {
    displayOrder: Number(displayOrder) || 0
  });
}

export async function deletePatron(id) {
  const docRef = doc(db, 'patrons', id);
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
      await createCoordinator({ name: c.name, state: c.state, lga: c.lga });
      summary.added++;
    } catch (err) {
      summary.errors.push(`${c.name}: ${err.message}`);
    }
  }
  return summary;
}

/* ---------------------------------------------------------------------------
   Members
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
   --------------------------------------------------------------------------- */

async function resizeImage(file, maxDim = 800, quality = 0.85) {
  if (file.type === 'image/gif') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) { resolve(file); return; }

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
        resolve(resized.size < file.size ? resized : file);
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(file);
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
    formData.append('token', deleteToken);

    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`;
    const res = await fetch(url, { method: 'POST', body: formData });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`Cloudinary delete failed (${res.status}) for "${publicId}":`, body);
    }
  } catch (err) {
    console.warn('Cloudinary cleanup failed for', publicId, err);
  }
}

async function deleteCloudinaryImage(publicId, deleteToken) {
  await deleteStorageFile(publicId, deleteToken);
}