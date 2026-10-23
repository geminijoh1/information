const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const postsDir = path.join(__dirname, '..', 'posts');
const dataFile = path.join(__dirname, '..', 'data', 'posts.json');

function parseFrontMatter(content) {
  const meta = {
    title: '',
    category: '기록',
    date: new Date().toISOString().split('T')[0],
    summary: '',
    author: ''
  };

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta, body: content.trim() };
  }

  const rawMeta = match[1];
  const body = match[2].trim();

  rawMeta.split(/\r?\n/).forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key && val) {
        meta[key] = val;
      }
    }
  });

  return { meta, body };
}

function sync() {
  console.log('📂 posts/ 폴더의 마크다운 글들을 읽어오는 중...');

  if (!fs.existsSync(postsDir)) {
    console.error('posts 폴더를 찾을 수 없습니다.');
    return;
  }

  const files = fs.readdirSync(postsDir)
    .filter(f => f.endsWith('.md'))
    .sort();

  const posts = [];

  files.forEach((filename, idx) => {
    const fullPath = path.join(postsDir, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { meta, body } = parseFrontMatter(content);

    const postTitle = meta.title || filename.replace(/^\d+_?/, '').replace(/\.md$/, '');
    const plainSummary = meta.summary || body.replace(/[#*`>~\[\]\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

    posts.push({
      id: 'post-' + Buffer.from(filename).toString('hex').slice(0, 12),
      title: postTitle,
      category: meta.category || '기록',
      date: meta.date || new Date().toISOString().split('T')[0],
      author: meta.author || '',
      summary: plainSummary,
      content: body
    });
  });

  // 날짜 역순 정렬 (최신 글이 위로)
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  fs.writeFileSync(dataFile, JSON.stringify(posts, null, 2), 'utf8');
  console.log(`✅ 총 ${posts.length}개의 글이 data/posts.json 에 정상 변환·반영되었습니다!`);

  // 깃허브 자동 푸시
  try {
    console.log('🚀 GitHub 원격 저장소로 자동 동기화 중...');
    execSync('git add posts/ data/posts.json', { stdio: 'ignore' });
    execSync('git commit -m "docs: sync posts from local markdown folder"', { stdio: 'ignore' });
    execSync('git push origin main', { stdio: 'ignore' });
    console.log('🎉 GitHub 저장소 동기화까지 완료되었습니다!');
  } catch (err) {
    console.log('ℹ️ 로컬 반영 완료 (GitHub 푸시는 생략되었거나 변경 사항이 없습니다)');
  }
}

sync();
