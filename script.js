// ============================================================
// CONFIG — edit these to match your repo
// ============================================================
const GITHUB_OWNER = 'codemonk-007';
const GITHUB_REPO  = 'GRE-questions-Gallery';
const GITHUB_BRANCH = 'main';

// ============================================================
// Token storage (never hardcode the token)
// ============================================================
const TOKEN_KEY = 'gre_gallery_token';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ============================================================
// DOM Elements
// ============================================================
const gallery = document.getElementById('gallery');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const settingsBtn = document.getElementById('settings-btn');
const modal = document.getElementById('gallery-modal');
const modalImg = document.getElementById('modal-img');
const toastEl = document.getElementById('toast');

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();
    setupEventListeners();
    setupPasteHandler();
});

// ============================================================
// Gallery Load
// ============================================================
function loadGallery() {
    fetch('images.json?t=' + Date.now())
        .then(r => r.json())
        .then(images => {
            gallery.innerHTML = '';
            if (!images.length) {
                gallery.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#64748b;">No images yet. Tap the + button to upload your first question.</p>';
                return;
            }
            images.forEach(name => {
                const card = document.createElement('div');
                card.className = 'card';
                const img = document.createElement('img');
                img.src = `images/${name}`;
                img.alt = name;
                img.loading = 'lazy';
                img.addEventListener('click', () => openModal(img.src));
                card.appendChild(img);
                gallery.appendChild(card);
            });
        })
        .catch(() => {
            gallery.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#dc2626;">Error loading images.json</p>';
        });
}

// ============================================================
// Modal
// ============================================================
function openModal(src) {
    modalImg.src = src;
    modal.classList.add('active');
}

modal.addEventListener('click', () => {
    modal.classList.remove('active');
});

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {
    // Upload Button
    uploadBtn.addEventListener('click', () => {
        if (!getToken()) { promptForToken(); return; }
        fileInput.click();
    });

    // File Input
    fileInput.addEventListener('change', e => {
        const files = Array.from(e.target.files);
        if (files.length) processFiles(files);
        e.target.value = '';
    });

    // Settings Button
    settingsBtn.addEventListener('click', () => {
        if (getToken()) {
            if (confirm('Clear your saved GitHub token?')) {
                clearToken();
                toast('Token cleared.');
            }
        } else {
            promptForToken();
        }
    });
}

// ============================================================
// Paste Handler (Ctrl+V anywhere)
// ============================================================
function setupPasteHandler() {
    document.addEventListener('paste', e => {
        const items = e.clipboardData?.items || [];
        const files = [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const f = item.getAsFile();
                if (f) files.push(f);
            }
        }
        if (files.length) {
            e.preventDefault();
            if (!getToken()) { promptForToken(); return; }
            processFiles(files);
        }
    });
}

// ============================================================
// Token Prompt
// ============================================================
function promptForToken() {
    const t = prompt(
        'Paste your GitHub fine-grained Personal Access Token.\n\n' +
        'It will be stored in this browser only. Create one at:\n' +
        'github.com/settings/tokens?type=beta\n\n' +
        'Scopes needed: Contents = Read and write'
    );
    if (t && t.trim()) {
        setToken(t.trim());
        toast('Token saved. You can now upload.');
    }
}

// ============================================================
// Process Files
// ============================================================
async function processFiles(files) {
    for (const file of files) {
        const suggested = suggestFilename(file);
        const name = prompt('Filename for this image:', suggested);
        if (!name) continue;
        
        const clean = sanitize(name);
        if (!clean.endsWith('.png') && !clean.endsWith('.jpg') &&
            !clean.endsWith('.jpeg') && !clean.endsWith('.webp')) {
            toast('Use .png, .jpg, .jpeg, or .webp'); continue;
        }
        
        try {
            toast('Uploading ' + clean + '…');
            await uploadToGitHub(file, clean);
            toast('Uploaded ' + clean);
        } catch (err) {
            console.error(err);
            toast('Upload failed: ' + err.message);
            if (String(err.message).includes('401') || String(err.message).includes('403')) {
                clearToken();
                toast('Token rejected. Please re-enter.');
            }
            return; // Stop processing the rest if one fails
        }
    }
    loadGallery();
}

function suggestFilename(file) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    let ext = (file.name.match(/\.(png|jpe?g|webp)$/i) || [, '.png'])[1].toLowerCase();
    if (ext === 'jpeg') ext = '.jpg';
    return `q-${stamp}${ext}`;
}

function sanitize(name) {
    return name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
}

// ============================================================
// GitHub Atomic Upload via Trees API
// ============================================================
async function uploadToGitHub(file, filename) {
    const token = getToken();
    const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    // 1. Get current commit + tree SHA
    const refRes = await fetch(`${api}/git/ref/heads/${GITHUB_BRANCH}`, { headers });
    if (!refRes.ok) throw new Error(`ref ${refRes.status}`);
    const refData = await refRes.json();
    const parentSha = refData.object.sha;

    const commitRes = await fetch(`${api}/git/commits/${parentSha}`, { headers });
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 2. Read current images.json
    const jsonRes = await fetch(`${api}/contents/images.json?ref=${GITHUB_BRANCH}`, { headers });
    const jsonData = await jsonRes.json();
    const decoded = decodeURIComponent(escape(atob(jsonData.content.replace(/\n/g, ''))));
    let currentImages = [];
    try { currentImages = JSON.parse(decoded); } catch (e) { currentImages = []; }

    // Avoid duplicates
    if (currentImages.includes(filename)) {
        throw new Error('A file with that name already exists.');
    }
    const newImages = [...currentImages, filename].sort();

    // 3. Upload image blob
    const imgBase64 = await fileToBase64(file);
    const imgBlobRes = await fetch(`${api}/git/blobs`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: imgBase64, encoding: 'base64' })
    });
    if (!imgBlobRes.ok) throw new Error(`blob ${imgBlobRes.status}`);
    const imgBlob = await imgBlobRes.json();

    // 4. Upload new images.json blob
    const jsonBlobRes = await fetch(`${api}/git/blobs`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: JSON.stringify(newImages, null, 2),
            encoding: 'utf-8'
        })
    });
    const jsonBlob = await jsonBlobRes.json();

    // 5. Create new tree
    const treeRes = await fetch(`${api}/git/trees`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: [
                { path: `images/${filename}`, mode: '100644', type: 'blob', sha: imgBlob.sha },
                { path: 'images.json', mode: '100644', type: 'blob', sha: jsonBlob.sha }
            ]
        })
    });
    const treeData = await treeRes.json();

    // 6. Create commit
    const newCommitRes = await fetch(`${api}/git/commits`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Add ${filename}`,
            tree: treeData.sha,
            parents: [parentSha]
        })
    });
    const newCommit = await newCommitRes.json();

    // 7. Update branch ref
    const updateRes = await fetch(`${api}/git/refs/heads/${GITHUB_BRANCH}`, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha, force: false })
    });
    if (!updateRes.ok) throw new Error(`ref update ${updateRes.status}`);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            resolve(result.split(',')[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================================
// Toast Helper
// ============================================================
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}
