@echo off
title Local AI Directory Assistant Launcher
echo =========================================================
echo Starting Local Windows AI Directory Assistant (RAGlite)...
echo =========================================================
echo Checking python environment status...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.8+ to execute this desktop assistant.
    pause
    exit /b
)

echo Installing dependencies...
python -m pip install google-genai --quiet
if %errorlevel% neq 0 (
    echo [WARNING] Fallback connection mode active. standard urllib will be utilized.
)

echo Initializing Desktop Tkinter UI...
start python windows_assistant_bootstrap.py
