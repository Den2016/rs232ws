/*
Section "Registry Keys for Auto Start"
WriteRegStr HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "rs232ws" "$INSTDIR$\rs232ws.exe"
SectionEnd

Section "Remove Registry Key"
DeleteRegValue HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "rs232ws"
SectionEnd
*/
!macro customInstall
  ; Добавляем запись в автозагрузку текущего пользователя
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "rs232ws" "$INSTDIR\rs232ws.exe"
!macroend

!macro customUnInstall
  ; Удаляем запись при удалении
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "rs232ws"
!macroend