@REM @echo off
@REM cd /d "D:\m-one\aio\test-case\testcase-v2\4-may\testcase-majore"
@REM echo %date% %time% - Starting npm run dev >> D:\autostart.log
@REM npm run dev >> D:\autostart.log 2>&1
@REM echo %date% %time% - npm run dev exited >> D:\autostart.log
@REM pause

@echo off
cd /d "D:\m-one\aio\test-case\testcase-v2\4-may\testcase-majore"

echo %date% %time% - Starting npm run dev >> D:\autostart.log

REM Jalankan npm run dev di background
start /b npm run dev >> D:\autostart.log 2>&1

REM Tunggu 5 detik untuk server siap
echo Waiting for server to start...
timeout /t 5 /nobreak > nul

REM Buka browser ke localhost (sesuaikan port dengan app Anda)
echo Opening browser... >> D:\autostart.log
start "" "http://localhost:3000"

REM Atau jika portnya beda, ganti dengan:
REM start "" "http://localhost:5173"  # Untuk Vite
REM start "" "http://localhost:8080"  # Untuk webpack
REM start "" "http://localhost:5000"  # Untuk banyak framework

echo %date% %time% - Browser opened and npm run dev running >> D:\autostart.log

REM Biarkan window terbuka untuk monitoring
echo npm run dev is running in background
echo Close this window to stop the process
pause