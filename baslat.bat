@echo off
rem Palmera Nights - yerel sunucuyu baslatir: http://localhost:8080
cd /d "%~dp0"
echo Palmera Nights: http://localhost:8080  (kapatmak icin Ctrl+C)
start "" http://localhost:8080
php -S localhost:8080
