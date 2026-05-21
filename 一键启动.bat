@echo off
chcp 65001 >nul
title 气象题库练习系统

set PYTHON=C:\Users\w\AppData\Local\Programs\Python\Python312\python.exe
set DIR=%~dp0

echo ========================================
echo   气象题库练习系统
echo   地址: http://localhost:8080/index.html
echo   关闭此窗口将停止服务
echo ========================================
echo.
echo 正在启动服务...

:: 后台启动服务器
start /b "" "%PYTHON%" -m http.server 8080 --directory "%DIR%"

:: 等待服务就绪后打开浏览器
timeout /t 2 /nobreak >nul
start http://localhost:8080/index.html
