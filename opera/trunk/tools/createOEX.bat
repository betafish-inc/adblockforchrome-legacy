@echo off
echo This will create a new OEX file
echo Make sure you've updated the version number!
echo.

call pullfromchrome.bat

echo running messages.json validator
ValidateMessages.json.exe -closeIfNoMessages -removeUnusedStrings -minimizeForRelease
pause

del "adblock.oex"
cd ..
if exist "%programfiles%\7-Zip\7z.exe" (
  "%programfiles%\7-Zip\7z.exe" a -mx=9 -tzip "tools\adblock.oex" @tools\include_in_oex.txt
) else (
  echo No 7Zip found. Zip all files listed in "include_in_oex.txt" yourself and rename it to an .oex file
)
pause

echo Don't forget to create a tag!
pause