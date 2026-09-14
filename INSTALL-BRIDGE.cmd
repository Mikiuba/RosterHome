@echo off
start "" chrome "chrome://extensions"
start "" explorer "%~dp0chrome-extension"
echo.
echo En Chrome: activa Modo de desarrollador ^> Cargar descomprimida ^> selecciona la carpeta chrome-extension.
pause
