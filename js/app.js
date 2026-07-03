/* ============================================================
   파일 우체국 — GitHub 저장소를 스토리지로 쓰는 파일 공유 앱
   업로드/삭제: GitHub Contents API (토큰 필요)
   다운로드/목록: 공개 저장소라 토큰 없이 동작
   ============================================================ */
"use strict";

const CONFIG = {
  owner: "mini486ok",
  repo: "file-sharing",
  branch: "main",
  dir: "files",
  maxSize: 100 * 1024 * 1024, // GitHub 한 파일 최대 100MB
};

const API = "https://api.github.com";
const TOKEN_KEY = "filepost_token";

// 현재 보관함 파일 목록 (name → {name, size, sha, download_url, path})
let files = new Map();
let uploading = false;
const uploadQueue = [];

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const fileListEl = $("fileList");
const emptyState = $("emptyState");
const loadingState = $("loadingState");
const queueSection = $("queue");
const queueList = $("queueList");
const fileCount = $("fileCount");
const tokenModal = $("tokenModal");
const tokenInput = $("tokenInput");
const tokenStatus = $("tokenStatus");

// ---------- 유틸 ----------
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function apiHeaders(extra = {}) {
  const h = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
  const t = getToken();
  if (t) h.Authorization = "Bearer " + t;
  return h;
}

function contentsUrl(name) {
  const path = CONFIG.dir + (name ? "/" + name : "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${encoded}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return "FILE";
  return name.slice(i + 1).toUpperCase().slice(0, 6);
}

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 450);
  }, 3600);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // "data:...;base64,XXXX"
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}

// ---------- 파일 목록 ----------
async function refreshList(silent = false) {
  if (!silent) {
    loadingState.hidden = false;
    emptyState.style.display = "none";
  }
  try {
    const res = await fetch(contentsUrl() + "?ref=" + CONFIG.branch, {
      headers: apiHeaders(),
      cache: "no-store",
    });
    if (res.status === 404) {
      files = new Map(); // files/ 폴더가 아직 없음 = 빈 보관함
    } else if (!res.ok) {
      throw new Error("목록 조회 실패 (HTTP " + res.status + ")");
    } else {
      const data = await res.json();
      files = new Map(
        data
          .filter((f) => f.type === "file")
          .map((f) => [f.name, {
            name: f.name,
            size: f.size,
            sha: f.sha,
            path: f.path,
            download_url: f.download_url,
          }])
      );
    }
    renderList();
  } catch (err) {
    toast("✖ " + err.message, "err");
  } finally {
    loadingState.hidden = true;
  }
}

let newlyUploaded = new Set();

function renderList() {
  fileListEl.innerHTML = "";
  const sorted = [...files.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "ko")
  );
  fileCount.textContent = sorted.length;
  emptyState.style.display = sorted.length ? "none" : "";

  sorted.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.style.animationDelay = Math.min(i * 0.04, 0.4) + "s";
    li.draggable = true;

    const stamp = document.createElement("span");
    stamp.className = "f-stamp";
    stamp.textContent = extOf(f.name);

    const info = document.createElement("div");
    info.className = "f-info";
    const nameEl = document.createElement("div");
    nameEl.className = "f-name";
    nameEl.textContent = f.name;
    nameEl.title = f.name;
    const meta = document.createElement("div");
    meta.className = "f-meta";
    meta.textContent = formatSize(f.size);
    info.append(nameEl, meta);

    const actions = document.createElement("div");
    actions.className = "f-actions";

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn btn-ghost btn-sm";
    dlBtn.textContent = "⤓ 다운로드";
    dlBtn.addEventListener("click", () => downloadFile(f, dlBtn));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-ghost btn-sm";
    delBtn.textContent = "✕ 삭제";
    let armed = false;
    let armTimer;
    delBtn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        delBtn.textContent = "정말 삭제?";
        delBtn.classList.add("btn-danger-armed");
        armTimer = setTimeout(() => {
          armed = false;
          delBtn.textContent = "✕ 삭제";
          delBtn.classList.remove("btn-danger-armed");
        }, 3000);
      } else {
        clearTimeout(armTimer);
        deleteFile(f, delBtn);
      }
    });

    actions.append(dlBtn, delBtn);

    const dragHint = document.createElement("span");
    dragHint.className = "f-drag-hint";
    dragHint.textContent = "⠿";
    dragHint.title = "바탕화면으로 끌어다 놓으면 다운로드";

    li.append(stamp, info, actions, dragHint);

    if (newlyUploaded.has(f.name)) {
      const badge = document.createElement("span");
      badge.className = "f-new";
      badge.textContent = "접수됨";
      actions.before(badge);
    }

    // 브라우저 밖으로 드래그 → 다운로드 (Chrome/Edge의 DownloadURL)
    li.addEventListener("dragstart", (e) => {
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(
        "DownloadURL",
        `application/octet-stream:${f.name}:${f.download_url}`
      );
      e.dataTransfer.setData("text/uri-list", f.download_url);
      e.dataTransfer.setData("text/plain", f.download_url);
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));

    fileListEl.appendChild(li);
  });
}

// ---------- 다운로드 ----------
async function downloadFile(f, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "받는 중…";
  try {
    // 1차: raw URL (API 사용량 소모 없음) / 2차: Contents API raw
    let res = await fetch(f.download_url, { cache: "no-store" });
    if (!res.ok) {
      res = await fetch(contentsUrl(f.name) + "?ref=" + CONFIG.branch, {
        headers: apiHeaders({ Accept: "application/vnd.github.raw" }),
      });
    }
    if (!res.ok) throw new Error("다운로드 실패 (HTTP " + res.status + ")");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("⤓ " + f.name + " 다운로드 시작", "ok");
  } catch (err) {
    toast("✖ " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// ---------- 업로드 ----------
function enqueueFiles(list) {
  const arr = [...list];
  if (!arr.length) return;
  if (!getToken()) {
    toast("🔑 업로드하려면 먼저 토큰을 설정하세요", "err");
    openModal();
    return;
  }
  for (const file of arr) {
    if (file.size > CONFIG.maxSize) {
      toast("✖ " + file.name + " — 100MB를 초과합니다", "err");
      continue;
    }
    if (file.size === 0) {
      toast("✖ " + file.name + " — 빈 파일은 올릴 수 없습니다", "err");
      continue;
    }
    uploadQueue.push(file);
  }
  processQueue();
}

async function processQueue() {
  if (uploading) return;
  uploading = true;
  queueSection.hidden = false;

  while (uploadQueue.length) {
    const file = uploadQueue.shift();
    const row = makeQueueRow(file);
    try {
      await uploadOne(file, row);
      row.status.textContent = "발송완료";
      row.status.className = "q-status ok";
      newlyUploaded.add(file.name);
      toast("✉ " + file.name + " 업로드 완료", "ok");
    } catch (err) {
      row.status.textContent = "실패";
      row.status.className = "q-status err";
      toast("✖ " + file.name + " — " + err.message, "err");
    }
  }

  uploading = false;
  // 업로드 응답으로 files 맵을 이미 갱신했으므로 재조회 없이 바로 렌더
  // (커밋 직후 목록 API는 이전 상태를 돌려줄 수 있음)
  renderList();
  // 잠시 후 대기열 정리
  setTimeout(() => {
    if (!uploading && !uploadQueue.length) {
      queueList.innerHTML = "";
      queueSection.hidden = true;
    }
  }, 2500);
}

function makeQueueRow(file) {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.className = "q-name";
  name.textContent = file.name;
  const bar = document.createElement("div");
  bar.className = "q-bar";
  const fill = document.createElement("div");
  fill.className = "q-bar-fill";
  bar.appendChild(fill);
  const status = document.createElement("span");
  status.className = "q-status";
  status.textContent = "준비 중";
  li.append(name, bar, status);
  queueList.appendChild(li);
  return { fill, status };
}

async function uploadOne(file, row, retried = false) {
  row.status.textContent = "인코딩";
  const content = await fileToBase64(file);
  row.status.textContent = "전송 중";

  const body = {
    message: "upload: " + file.name,
    content,
    branch: CONFIG.branch,
  };
  const existing = files.get(file.name);
  if (existing) body.sha = existing.sha;

  const { status, json } = await xhrPut(contentsUrl(file.name), body, (pct) => {
    row.fill.style.width = pct + "%";
  });

  if (status === 200 || status === 201) {
    // 응답에 담긴 새 파일 정보로 목록을 즉시 갱신
    if (json && json.content) {
      files.set(json.content.name, {
        name: json.content.name,
        size: json.content.size,
        sha: json.content.sha,
        path: json.content.path,
        download_url: json.content.download_url,
      });
    }
    return;
  }

  if ((status === 409 || status === 422) && !retried) {
    // 다른 커밋과 충돌 → 해당 파일의 최신 sha를 받아서 1회 재시도
    try {
      const res = await fetch(contentsUrl(file.name) + "?ref=" + CONFIG.branch, {
        headers: apiHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const cur = await res.json();
        files.set(file.name, {
          name: cur.name, size: cur.size, sha: cur.sha,
          path: cur.path, download_url: cur.download_url,
        });
      } else if (res.status === 404) {
        files.delete(file.name);
      }
    } catch { /* 재시도에서 판정 */ }
    return uploadOne(file, row, true);
  }
  if (status === 401) throw new Error("토큰이 유효하지 않습니다 (401)");
  if (status === 403) throw new Error("권한이 없거나 요청 한도 초과 (403)");
  if (status === 404) throw new Error("저장소 접근 불가 — 토큰 권한 확인 (404)");
  throw new Error("업로드 실패 (HTTP " + status + ")");
}

function xhrPut(url, bodyObj, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    const headers = apiHeaders({ "Content-Type": "application/json" });
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* 본문 없음 */ }
      resolve({ status: xhr.status, json });
    });
    xhr.addEventListener("error", () => reject(new Error("네트워크 오류")));
    xhr.send(JSON.stringify(bodyObj));
  });
}

// ---------- 삭제 ----------
async function deleteFile(f, btn) {
  if (!getToken()) {
    toast("🔑 삭제하려면 먼저 토큰을 설정하세요", "err");
    openModal();
    return;
  }
  btn.disabled = true;
  btn.textContent = "삭제 중…";
  try {
    const res = await fetch(contentsUrl(f.name), {
      method: "DELETE",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: "delete: " + f.name,
        sha: f.sha,
        branch: CONFIG.branch,
      }),
    });
    if (!res.ok) throw new Error("삭제 실패 (HTTP " + res.status + ")");
    newlyUploaded.delete(f.name);
    files.delete(f.name); // 커밋 직후 목록 API는 지연될 수 있어 로컬에서 즉시 반영
    toast("🗑 " + f.name + " 삭제됨", "ok");
    renderList();
  } catch (err) {
    toast("✖ " + err.message, "err");
    btn.disabled = false;
    btn.textContent = "✕ 삭제";
  }
}

// ---------- 드래그 앤 드랍 (업로드) ----------
let dragDepth = 0;

// 페이지 어디에 떨어뜨려도 브라우저가 파일을 열지 않도록
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

document.addEventListener("dragenter", (e) => {
  // 외부에서 들어온 파일 드래그일 때만 반응 (내부 파일 목록 드래그 제외)
  if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
    dragDepth++;
    dropzone.classList.add("dragover");
  }
});
document.addEventListener("dragleave", () => {
  if (dragDepth > 0) dragDepth--;
  if (dragDepth === 0) dropzone.classList.remove("dragover");
});
document.addEventListener("drop", (e) => {
  dragDepth = 0;
  dropzone.classList.remove("dragover");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    enqueueFiles(e.dataTransfer.files);
  }
});

// 파일 선택 업로드
$("pickBtn").addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dblclick", () => fileInput.click());
fileInput.addEventListener("change", () => {
  enqueueFiles(fileInput.files);
  fileInput.value = "";
});

// ---------- 토큰 모달 ----------
function openModal() {
  tokenModal.hidden = false;
  tokenInput.value = getToken();
  updateTokenStatus();
  tokenInput.focus();
}
function closeModal() {
  tokenModal.hidden = true;
}
function updateTokenStatus() {
  tokenStatus.textContent = getToken()
    ? "✔ 토큰이 이 브라우저에 저장되어 있습니다"
    : "토큰이 설정되지 않았습니다 — 다운로드만 가능합니다";
}

$("tokenBtn").addEventListener("click", openModal);
$("closeModalBtn").addEventListener("click", closeModal);
tokenModal.addEventListener("click", (e) => {
  if (e.target === tokenModal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !tokenModal.hidden) closeModal();
});

$("saveTokenBtn").addEventListener("click", async () => {
  const t = tokenInput.value.trim();
  if (!t) {
    toast("✖ 토큰을 입력하세요", "err");
    return;
  }
  // 토큰 유효성 검사: 저장소 정보 조회
  try {
    const res = await fetch(`${API}/repos/${CONFIG.owner}/${CONFIG.repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + t,
      },
    });
    if (!res.ok) throw new Error();
    localStorage.setItem(TOKEN_KEY, t);
    updateTokenStatus();
    toast("🔑 토큰 저장 완료 — 이제 업로드할 수 있습니다", "ok");
    closeModal();
  } catch {
    toast("✖ 토큰이 유효하지 않거나 저장소 접근 권한이 없습니다", "err");
  }
});

$("clearTokenBtn").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  tokenInput.value = "";
  updateTokenStatus();
  toast("토큰이 삭제되었습니다");
});

// ---------- 기타 ----------
$("refreshBtn").addEventListener("click", () => {
  newlyUploaded = new Set();
  refreshList();
});

// 소인(postmark)에 오늘 날짜
(function setPostmarkDate() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  $("postmarkDate").textContent = `${d.getFullYear()}.${mm}.${dd}`;
})();

// 시작
refreshList();
