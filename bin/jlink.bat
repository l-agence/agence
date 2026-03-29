@echo off
REM Usage: link <source_dir> <link_dir>
if "%~2"=="" (
  echo Usage: link ^<source_dir^> ^<link_dir^>
  exit /b 1
)
cmd /c mklink /j "%~2" "%~1"