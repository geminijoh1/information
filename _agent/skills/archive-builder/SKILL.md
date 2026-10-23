---
name: archive-builder
description: GitHub API & Vercel 기반의 정적 개인 기록 및 아카이브 홈페이지를 관리, 유지보수, 기능 확장하는 에이전트 스킬입니다.
---

# Archive Builder Agent Skill

## 개요
본 스킬은 Vercel Serverless Function(`/api/config`)과 GitHub REST API를 활용하여 별도의 외부 데이터베이스 없이 정적 아카이브 웹사이트를 운영하는 구조를 정의합니다.

## 시스템 아키텍처 규칙
1. **Zero-Config 배포 (`vercel.json`)**:
   - `builds` 선언을 일체 사용하지 않으며, `cleanUrls: true`, `trailingSlash: false`만을 설정합니다.
   - `/api` 폴더 내의 스크립트(`api/config.js`)는 서버리스 엔드포인트(`/api/config`)로 자동 배포됩니다.
2. **`public/` 폴더 절대 금지**:
   - Vercel이 `public/` 디렉터리를 루트로 인식해 루트 HTML 파일이 404가 되는 현상을 방지하기 위해 데이터는 반드시 `data/posts.json`에 보관합니다.
3. **병렬 설정 조회 및 보안 (`loadConfig()`)**:
   - `/api/config`와 `config/git_config.json`을 병렬 조회하여 토큰은 환경 변수에서, 저장소 정보는 정적 파일에서 안정적으로 병합합니다.
   - 토큰의 공백/줄바꿈(`.trim()`)을 정제하여 `Invalid value` 헤더 오류를 방지합니다.
4. **마크다운 자체 렌더링**:
   - 무거운 외부 라이브러리 없이 `db.js`의 `renderMarkdown()` 및 `markdownToText()`를 통해 안전한 HTML 이스케이프 및 서식 렌더링을 수행합니다.
