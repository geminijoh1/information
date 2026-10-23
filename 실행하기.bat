@echo off
chcp 65001 > nul
echo ========================================================
echo   개인 기록 아카이브 로컬 서버를 시작합니다.
echo   브라우저가 자동으로 열립니다: http://localhost:8080
echo   (종료하시려면 이 창을 닫으시면 됩니다)
echo ========================================================

start "" http://localhost:8080/index.html
npx -y http-server -p 8080 -c-1
