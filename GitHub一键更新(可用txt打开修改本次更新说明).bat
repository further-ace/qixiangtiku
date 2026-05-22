@echo off
title GitHub 一键更新网站

echo ========================================
echo   网站一键更新脚本
echo ========================================
echo.

:: 检查是否在 Git 仓库目录
if not exist ".git" (
    echo 错误：当前目录不是 Git 仓库根目录！
    echo 请将此脚本放在包含 .git 文件夹的项目目录中运行。
    pause
    exit /b 1
)

:: 获取当前时间作为提交信息的一部分（格式：YYYY-MM-DD HH:MM:SS）
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set date=%%a-%%b-%%c
for /f "tokens=1-3 delims=:." %%a in ('echo %time%') do set time=%%a:%%b:%%c
set commit_msg="自动更新 %date% %time%"

echo 正在添加所有修改...
git add .

echo 正在提交...
git commit -m %增加答题进度记忆，回看自动清除作答%
::本次更新说明

echo 正在推送到 GitHub...
git push

echo.
echo ========================================
echo 更新完成！请等待 1-2 分钟后访问网站。
echo 按任意键退出...
pause > nul