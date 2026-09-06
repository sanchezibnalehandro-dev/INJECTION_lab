@echo off
cd /d "%~dp0"

title INJECTION LAB

if not defined NODE_EXTRA_CA_CERTS if exist "%~dp0certs\russian_trusted_root_ca_pem.crt" set "NODE_EXTRA_CA_CERTS=%~dp0certs\russian_trusted_root_ca_pem.crt"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

start "" cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:3000"

call npm run dev

pause
