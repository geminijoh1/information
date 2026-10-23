let _config = null;

async function loadConfig() {
  if (_config) return _config;
  let api = {}, file = {}, local = {};
  try { const r = await fetch('/api/config'); if (r.ok) api = await r.json(); } catch(e) {}
  try { const r = await fetch('config/git_config.local.json'); if (r.ok) local = await r.json(); } catch(e) {}
  try { const r = await fetch('config/git_config.json'); if (r.ok) file = await r.json(); } catch(e) {}
  const apiTok = String(api.github_token || '').trim();
  const localTok = String(local.github_token || '').trim();
  const fileTok = String(file.github_token || '').trim();
  const effectiveTok = (apiTok && apiTok !== 'YOUR_GITHUB_TOKEN') ? apiTok :
                       (localTok && localTok !== 'YOUR_GITHUB_TOKEN') ? localTok : fileTok;
  _config = {
    github_token: effectiveTok,
    github_owner: local.github_owner || file.github_owner || '',
    github_repo: local.github_repo || file.github_repo || '',
    data_file_path: local.data_file_path || file.data_file_path || 'data/posts.json',
    admin_password: api.admin_password || local.admin_password || file.admin_password || 'admin1234'
  };
  return _config;
}

function isAdmin() {
  return sessionStorage.getItem('isAdmin') === 'true';
}

function requireAdmin() {
  if (!isAdmin()) {
    window.location.href = 'admin.html';
  }
}

async function getPosts() {
  const cfg = await loadConfig();
  
  if (cfg.github_owner && cfg.github_repo) {
    try {
      const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (cfg.github_token && cfg.github_token !== 'YOUR_GITHUB_TOKEN') {
        headers['Authorization'] = 'token ' + cfg.github_token.trim();
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
        const posts = JSON.parse(decoded);
        localStorage.setItem('cached_posts', JSON.stringify(posts));
        return posts;
      }
    } catch (e) {
      console.warn('GitHub API fetch failed, fallback to local file:', e);
    }
  }

  try {
    const res = await fetch(cfg.data_file_path || 'data/posts.json');
    if (res.ok) {
      const posts = await res.json();
      localStorage.setItem('cached_posts', JSON.stringify(posts));
      return posts;
    }
  } catch (e) {
    console.warn('Local posts.json fetch failed:', e);
  }

  const cached = localStorage.getItem('cached_posts');
  return cached ? JSON.parse(cached) : [];
}

async function savePost(postData) {
  const cfg = await loadConfig();
  const token = (cfg.github_token || '').trim();

  if (!token || token === 'YOUR_GITHUB_TOKEN') {
    throw new Error('GitHub 토큰이 설정되지 않았습니다. Vercel 환경 변수나 설정 파일을 확인해 주세요.');
  }
  if (!cfg.github_owner || !cfg.github_repo) {
    throw new Error('GitHub 저장소 설정(github_owner, github_repo)이 올바르지 않습니다.');
  }

  let posts = await getPosts();
  let sha = null;

  const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  try {
    const fileRes = await fetch(url, { headers });
    if (fileRes.ok) {
      const fileJson = await fileRes.json();
      sha = fileJson.sha;
    }
  } catch (e) {}

  if (postData.id) {
    const index = posts.findIndex(p => p.id === postData.id);
    if (index !== -1) {
      posts[index] = { ...posts[index], ...postData };
    } else {
      posts.unshift(postData);
    }
  } else {
    postData.id = 'post-' + Date.now();
    posts.unshift(postData);
  }

  const jsonStr = JSON.stringify(posts, null, 2);
  const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

  const bodyData = {
    message: `feat(posts): update post ${postData.title || postData.id}`,
    content: contentBase64
  };
  if (sha) bodyData.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(bodyData)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(`저장 실패 (${putRes.status}): ${errData.message || putRes.statusText}`);
  }

  localStorage.setItem('cached_posts', JSON.stringify(posts));
  return postData;
}

async function deletePost(postId) {
  const cfg = await loadConfig();
  const token = (cfg.github_token || '').trim();

  if (!token || token === 'YOUR_GITHUB_TOKEN') {
    throw new Error('GitHub 토큰이 설정되지 않았습니다.');
  }

  let posts = await getPosts();
  const targetPost = posts.find(p => p.id === postId);
  posts = posts.filter(p => p.id !== postId);

  let sha = null;
  const url = `https://api.github.com/repos/${cfg.github_owner}/${cfg.github_repo}/contents/${cfg.data_file_path}`;
  const headers = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  const fileRes = await fetch(url, { headers });
  if (fileRes.ok) {
    const fileJson = await fileRes.json();
    sha = fileJson.sha;
  }

  const jsonStr = JSON.stringify(posts, null, 2);
  const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

  const bodyData = {
    message: `feat(posts): delete post ${targetPost ? targetPost.title : postId}`,
    content: contentBase64
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
