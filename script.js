// ============================================================
// CONFIG
// ============================================================
const GITHUB_OWNER  = 'codemonk-007';
const GITHUB_REPO   = 'GRE-questions-Gallery';
const GITHUB_BRANCH = 'main';

// ============================================================
// TOKEN STORAGE
// ============================================================
const TOKEN_KEY = 'gre_gallery_token';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ============================================================
// DOM REFERENCES
// ============================================================
const gallery     = document.getElementById('gallery');
const fileInput   = document.getElementById('file-input');
const uploadBtn   = document.getElementById('upload-btn');
const settingsBtn = document.getElementById('settings-btn');
const modal       = document.getElementById('gallery-modal');
const modalImg    = document.getElementById('modal-img');
const toastEl     = document.getElementById('toast');
const countEl     = document.getElementById('image-count');

// ============================================================
// UPLOAD LOCK
// ============================================================
let isUploading = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();
    setupEventListeners();
    setupPasteHandler();
});

// ============================================================
// GALLERY LOAD
// ============================================================
function loadGallery() {
    fetch('images.json?t=' + Date.now())
        .then(r => r.json())
        .then(images => {
            gallery.innerHTML = '';
            if (!images.length) {
                gallery.innerHTML = '<div class="empty-state">No images yet. Tap the + button to upload your first question.</div>';
                if (countEl) countEl.textContent = '0 questions';
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

                const dl = document.createElement('a');
                dl.className = 'card-download';
                dl.href = `images/${name}`;
                dl.download = name;
                dl.title = 'Download';
                dl.innerHTML = '⬇';
                dl.addEventListener('click', e => e.stopPropagation());

                card.appendChild(img);
                card.appendChild(dl);
                gallery.appendChild(card);
            });

            if (countEl) {
                countEl.textContent = `${images.length} question${images.length === 1 ? '' : 's'}`;
            }
        })
        .catch(() => {
            gallery.innerHTML = '<div class="empty-state error">Error loading images.json</div>';
            if (countEl) countEl.textContent = 'Error';
        });
}

// ============================================================
// MODAL
// ============================================================
function openModal(src) {
    modalImg.src = src;
    modal.classList.add('active');
}
modal.addEventListener('click', () => modal.classList.remove('active'));

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    uploadBtn.addEventListener('click', () => {
        if (!getToken()) { promptForToken(); return; }
        fileInput.click();
    });

    fileInput.addEventListener('change', e => {
        const files = Array.from(e.target.files);
        if (files.length) processFiles(files);
        e.target.value = '';
    });

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

    const dlAllBtn = document.getElementById('download-all-btn');
    if (dlAllBtn) dlAllBtn.addEventListener('click', downloadAllAsZip);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') modal.classList.remove('active');
    });
}

// ============================================================
// PASTE HANDLER (Ctrl+V anywhere)
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
// TOKEN PROMPT
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
// PROCESS FILES — no naming prompts, auto-generated names
// ============================================================
async function processFiles(files) {
    if (isUploading) {
        toast('Another upload is in progress. Please wait.');
        return;
    }
    isUploading = true;
    uploadBtn.disabled = true;

    try {
        const stamp = generateStamp();

        const planned = buildFilenames(files, stamp);

        // Pre-flight duplicate check
        let existing = [];
        try {
            const res = await fetch('images.json?t=' + Date.now());
            existing = await res.json();
        } catch (e) {
            existing = [];
        }

        const conflicts = planned.filter(name => existing.includes(name));
        if (conflicts.length) {
            console.warn('Skipping duplicates:', conflicts);
            toast(`${conflicts.length} duplicate${conflicts.length === 1 ? '' : 's'} skipped.`);
        }

        // Upload sequentially
        let success = 0;
        let skipped = conflicts.length;
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
            const filename = planned[i];
            if (conflicts.includes(filename)) continue;

            try {
                toast(`Uploading ${i + 1}/${total}: ${filename}…`);
                await uploadToGitHub(files[i], filename);
                success++;
            } catch (err) {
                console.error('Failed:', filename, err);
                skipped++;
                if (String(err.message).includes('401') || String(err.message).includes('403')) {
                    clearToken();
                    toast('Token rejected. Batch aborted.');
                    return;
                }
            }
        }

        if (skipped === 0) {
            toast(`Uploaded ${success} image${success === 1 ? '' : 's'}.`);
        } else {
            toast(`Uploaded ${success}, skipped ${skipped}.`);
        }
    } finally {
        isUploading = false;
        uploadBtn.disabled = false;
        loadGallery();
    }
}

// ============================================================
// NAMING — timestamp-based, no user input
// ============================================================
function generateStamp() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildFilenames(files, stamp) {
    if (files.length === 1) {
        // Single: q-20251011-143022.png
        return [`q-${stamp}${getExt(files[0])}`];
    }
    // Batch: q-20251011-143022-001.png, q-20251011-143022-002.png, ...
    const digits = Math.max(3, String(files.length).length);
    return files.map((file, i) => {
        const num = String(i + 1).padStart(digits, '0');
        return `q-${stamp}-${num}${getExt(file)}`;
    });
}

function getExt(file) {
    const m = file.name.match(/\.(png|jpe?g|webp)$/i);
    if (!m) return '.png';
    const e = m[1].toLowerCase();
    return e === 'jpeg' ? '.jpg' : `.${e}`;
}

// ============================================================
// GITHUB ATOMIC UPLOAD
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

    if (currentImages.includes(filename)) {
        throw new Error('A file with that name already exists.');
    }
    const newImages = [...currentImages, filename].sort();

    // 3. Upload image blob
    const imgBase64 = await fileToBase64(file);
    const imgBlobRes = await fetch(`${api}/git/blobs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: imgBase64, encoding: 'base64' })
    });
    if (!imgBlobRes.ok) throw new Error(`blob ${imgBlobRes.status}`);
    const imgBlob = await imgBlobRes.json();

    // 4. Upload new images.json blob
    const jsonBlobRes = await fetch(`${api}/git/blobs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            content: JSON.stringify(newImages, null, 2),
            encoding: 'utf-8'
        })
    });
    const jsonBlob = await jsonBlobRes.json();

    // 5. Create new tree
    const treeRes = await fetch(`${api}/git/trees`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
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
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Add ${filename}`,
            tree: treeData.sha,
            parents: [parentSha]
        })
    });
    const newCommit = await newCommitRes.json();

    // 7. Update branch ref
    const updateRes = await fetch(`${api}/git/refs/heads/${GITHUB_BRANCH}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: newCommit.sha, force: false })
    });
    if (!updateRes.ok) throw new Error(`ref update ${updateRes.status}`);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================================
// DOWNLOAD ALL AS ZIP
// ============================================================
async function downloadAllAsZip() {
    const btn = document.getElementById('download-all-btn');
    if (typeof JSZip === 'undefined') {
        toast('JSZip failed to load. Check your internet.');
        return;
    }

    try {
        const res = await fetch('images.json?t=' + Date.now());
        const images = await res.json();
        if (!images.length) { toast('No images to download.'); return; }

        const originalHTML = btn.innerHTML;
        btn.disabled = true;

        const zip = new JSZip();
        const folder = zip.folder('gre-verbal-questions');

        let i = 0;
        for (const name of images) {
            i++;
            btn.innerHTML = `<span>Downloading ${i}/${images.length}…</span>`;
            try {
                const r = await fetch(`images/${name}`);
                const blob = await r.blob();
                folder.file(name, blob);
            } catch (e) {
                console.warn('Skipped', name, e);
            }
        }

        btn.innerHTML = '<span>Zipping…</span>';
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `gre-verbal-${stamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast('ZIP downloaded.');
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    } catch (err) {
        console.error(err);
        toast('Download failed: ' + err.message);
        btn.disabled = false;
    }
}

// ============================================================
// TOAST
// ============================================================
function toast(msg) {
    console.log('[toast]', msg);
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}
