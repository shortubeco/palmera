@echo off
rem Grand Drift Park - yerel sunucuyu baslatir: http://localhost:8080
cd /d "%~dp0"
echo Grand Drift Park: http://localhost:8080  (kapatmak icin Ctrl+C)
start "" http://localhost:8080
php -S localhost:8080
