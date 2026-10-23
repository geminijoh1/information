// ========================================================
//  GitHub REST API & 로컬 연동 전용 데이터 엔진
// ========================================================

function getConfig() {
  const token = (localStorage.getItem('gh_token') || '').trim();
  const owner = (localStorage.getItem('gh_owner') || 'geminijoh1').trim();
  const repo = (localStorage.getItem('gh_repo') || 'information').trim();

  return {
    github_token: token,
    github_owner: owner,
    github_repo: repo,
    data_file_path: 'data/posts.json'
  };
}

function isAdmin() {
  return true;
}

function requireAdmin() {
  return true;
}

// GitHub 저장소에서 최신 posts.json 읽기
async function getPosts() {
  const cfg = getConfig();

  // 1. GitHub API로 실시간 최신 데이터 조회 시도
  if (cfg.github_token && cfg.github_owner && cfg.github_repo) {
    try {
      const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}?ref=main&t=${Date.now()}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': 'token ' + cfg.github_token,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (res.ok) {
        const fileData = await res.json();
        const decoded = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
        const posts = JSON.parse(decoded);
        localStorage.setItem('cached_posts', JSON.stringify(posts));
        return posts;
      }
    } catch (e) {
      console.warn('GitHub API 조회 실패, 로컬 캐시/파일로 전환:', e);
    }
  }

  // 2. 오프라인이거나 API 실패 시 로컬 파일 조회
  try {
    const res = await fetch('data/posts.json?t=' + Date.now());
    if (res.ok) {
      const posts = await res.json();
      localStorage.setItem('cached_posts', JSON.stringify(posts));
      return posts;
    }
  } catch (e) {}

  // 3. 브라우저 캐시 반환
  const cached = localStorage.getItem('cached_posts');
  return cached ? JSON.parse(cached) : [];
}

// 새 글 저장 및 GitHub 원격 저장소 자동 커밋
async function savePost(postData) {
  const cfg = getConfig();
  const token = cfg.github_token;

  if (!token) {
    throw new Error('GitHub 토큰이 설정되지 않았습니다. 잠시 후 새로고침하거나 브라우저 설정을 확인해 주세요.');
  }

  // 1. 최신 글 목록 및 현재 SHA 조회
  let posts = await getPosts();
  let sha = null;
  const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  try {
    const fileRes = await fetch(url + '?ref=main&t=' + Date.now(), { headers });
    if (fileRes.ok) {
      const fileJson = await fileRes.json();
      sha = fileJson.sha;
    }
  } catch (e) {}

  // 2. 글 데이터 삽입 또는 수정
  if (postData.id) {
    const idx = posts.findIndex(p => p.id === postData.id);
    if (idx !== -1) {
      posts[idx] = { ...posts[idx], ...postData };
    } else {
      posts.unshift(postData);
    }
  } else {
    postData.id = 'post-' + Date.now();
    posts.unshift(postData);
  }

  // 3. GitHub API로 파일 커밋 (PUT)
  const jsonStr = JSON.stringify(posts, null, 2);
  const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

  const bodyData = {
    message: `feat(archive): ${postData.title ? `add/update "${postData.title}"` : 'update posts'}`,
    content: contentBase64,
    branch: 'main'
  };
  if (sha) bodyData.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(bodyData)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(`GitHub 커밋 실패 (${putRes.status}): ${errData.message || putRes.statusText}`);
  }

  localStorage.setItem('cached_posts', JSON.stringify(posts));
  return postData;
}

// 글 삭제
async function deletePost(postId) {
  const cfg = getConfig();
  const token = cfg.github_token;

  if (!token) {
    throw new Error('GitHub 토큰이 설정되지 않았습니다.');
  }

  let posts = await getPosts();
  const target = posts.find(p => p.id === postId);
  posts = posts.filter(p => p.id !== postId);

  let sha = null;
  const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  const fileRes = await fetch(url + '?ref=main&t=' + Date.now(), { headers });
  if (fileRes.ok) {
    const fileJson = await fileRes.json();
    sha = fileJson.sha;
  }

  const jsonStr = JSON.stringify(posts, null, 2);
  const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

  const bodyData = {
    message: `feat(archive): delete post "${target ? target.title : postId}"`,
    content: contentBase64,
    branch: 'main'
  };
  if (sha) bodyData.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(bodyData)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(`삭제 실패 (${putRes.status}): ${errData.message || putRes.statusText}`);
  }

  localStorage.setItem('cached_posts', JSON.stringify(posts));
  return true;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(src) {
  if (!src) return '';
  let text = escapeHtml(src);

  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre class="my-4 p-4 rounded-xl bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto leading-relaxed"><code>${code.trim()}</code></pre>`;
  });

  const parts = text.split(/(`[^`]+`)/g);
  text = parts.map(part => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const codeInside = part.slice(1, -1);
      return `<code class="px-1.5 py-0.5 mx-0.5 rounded bg-red-50 text-red-600 font-mono text-xs border border-red-100">${codeInside}</code>`;
    }
    return part;
  }).join('');

  text = text.replace(/^######\s+(.*)$/gm, '<h6 class="text-xs font-bold text-gray-800 mt-4 mb-2">$1</h6>');
  text = text.replace(/^#####\s+(.*)$/gm, '<h5 class="text-sm font-bold text-gray-800 mt-4 mb-2">$1</h5>');
  text = text.replace(/^####\s+(.*)$/gm, '<h4 class="text-base font-bold text-gray-800 mt-5 mb-2">$1</h4>');
  text = text.replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-bold text-gray-900 mt-6 mb-2 tracking-tight">$1</h3>');
  text = text.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-100 tracking-tight">$1</h2>');
  text = text.replace(/^#\s+(.*)$/gm, '<h1 class="text-2xl font-extrabold text-gray-900 mt-8 mb-4 tracking-tight">$1</h1>');

  text = text.replace(/^>\s+(.*)$/gm, '<blockquote class="border-l-4 border-red-500 pl-4 py-1.5 my-3 bg-red-50/50 rounded-r-lg text-sm text-gray-700 font-medium italic">$1</blockquote>');
  text = text.replace(/^(?:---|\*\*\*|___)$/gm, '<hr class="border-t border-gray-200 my-6" />');

  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
  text = text.replace(/~~(.*?)~~/g, '<del class="line-through text-gray-400">$1</del>');

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-red-600 hover:text-red-700 underline font-medium">$1</a>');

  text = text.replace(/^[\*\-]\s+(.*)$/gm, '<li class="ml-4 list-disc text-gray-700 leading-relaxed text-sm my-1">$1</li>');
  text = text.replace(/^\d+\.\s+(.*)$/gm, '<li class="ml-4 list-decimal text-gray-700 leading-relaxed text-sm my-1">$1</li>');

  const paragraphs = text.split(/\n{2,}/g);
  return paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<pre') || p.startsWith('<blockquote') || p.startsWith('<hr') || p.startsWith('<li')) {
      return p;
    }
    return `<p class="my-3 text-sm text-gray-700 leading-relaxed">${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');
}

function markdownToText(src) {
  if (!src) return '';
  let text = String(src);
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^>\s+/gm, '');
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  text = text.replace(/[\*_~]{1,2}/g, '');
  text = text.replace(/^[\*\-\d+\.]\s+/gm, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
