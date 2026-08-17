@echo off
cd /d "%~dp0"

rem Запускаем сервер в отдельном окне — python -m http.server не завершается сам и заблокировал бы этот .bat, если запустить его напрямую
start "Metro server" python -m http.server 8000

rem Даём серверу секунду на поднятие, чтобы Chrome не открыл страницу раньше, чем порт начнёт отвечать
timeout /t 1 /nobreak >nul

rem Открываем главную страницу в Chrome
start chrome http://localhost:8000/
