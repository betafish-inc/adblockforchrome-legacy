@echo off
echo Several files will be copied from the Chrome/Safari extension to this directory
echo.
echo Are the TRANSLATIONS MERGED INTO ADBLOCK FOR CHROME? This will overwrite them otherwise!

echo.

set dir=..\..\adblockforchrome
if not exist %dir% (
  set dir=..\..\..\trunk
) else (
  echo Is ADBLOCK FOR CHROME switched to TRUNK?
  echo.
)

xcopy "%dir%\_locales" "..\_locales\" /s /w /v /y
xcopy "%dir%\img\icon???.png" "..\img\" /v /y
xcopy "%dir%\img\delete.gif" "..\img\" /v /y
xcopy "%dir%\jquery\jquery*.min.js" "..\jquery\" /v /y
xcopy "%dir%\jquery\css\jquery-ui.custom.css" "..\jquery\css\" /s /v /y
xcopy "%dir%\jquery\css\images\ui-bg_*" "..\jquery\css\images\" /s /v /y
xcopy "%dir%\tools\I18N_include_exclude.txt" /v /y
xcopy "%dir%\tools\ValidateMessages.json.exe" /v /y
xcopy "%dir%\tools\tests\qunit.*" "tests\" /v /y

echo.
pause
