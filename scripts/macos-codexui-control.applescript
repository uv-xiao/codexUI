property sshTarget : "uvxiao@115.27.161.184"
property repoDir : "/home/uvxiao/codexUI"
property hostUiUrl : "http://10.101.0.11:5900"
property tailscaleUrl : "https://codexui-ios.tail27dc02.ts.net"
property localPort : "15900"
property remoteHost : "10.101.0.11"
property remotePort : "5900"

on run
	set actions to {"Open CodexUI", "Test status", "Restart services", "Stop services", "Open iOS URL"}
	set picked to choose from list actions with title "CodexUI Control" with prompt "Choose an action:" default items {"Open CodexUI"} OK button name "Run" cancel button name "Cancel"
	if picked is false then return
	set actionName to item 1 of picked
	
	if actionName is "Open CodexUI" then
		my openCodexUI()
	else if actionName is "Test status" then
		my testStatus()
	else if actionName is "Restart services" then
		my restartServices()
	else if actionName is "Stop services" then
		my stopServices()
	else if actionName is "Open iOS URL" then
		open location tailscaleUrl
	end if
end run

on openCodexUI()
	my ensureTunnel()
	open location ("http://127.0.0.1:" & localPort)
end openCodexUI

on ensureTunnel()
	try
		do shell script "curl -fsSI --max-time 3 http://127.0.0.1:" & localPort & "/ >/dev/null"
	on error
		my closeLocalTunnel()
		do shell script "ssh -fN -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L " & localPort & ":" & remoteHost & ":" & remotePort & " " & quoted form of sshTarget
		delay 1
		do shell script "curl -fsSI --max-time 5 http://127.0.0.1:" & localPort & "/ >/dev/null"
	end try
end ensureTunnel

on closeLocalTunnel()
	try
		do shell script "pids=$(lsof -tiTCP:" & localPort & " -sTCP:LISTEN 2>/dev/null || true); if [ -n \"$pids\" ]; then kill $pids; fi"
	end try
end closeLocalTunnel

on testStatus()
	set remoteScript to "cd " & quoted form of repoDir & " && scripts/docker-tailscale-ios.sh status && printf '\\nHost UI check:\\n' && curl -fsSI " & quoted form of hostUiUrl & " | sed -n '1,12p'"
	set outputText to my runRemote(remoteScript, 90)
	display dialog outputText with title "CodexUI Status" buttons {"OK"} default button "OK"
end testStatus

on restartServices()
	set remoteScript to "cd " & quoted form of repoDir & " && CODEXUI_BUILD_ON_UP=0 scripts/docker-tailscale-ios.sh up"
	set outputText to my runRemote(remoteScript, 180)
	set dialogResult to display dialog outputText with title "CodexUI Restart" buttons {"Open", "OK"} default button "Open"
	if button returned of dialogResult is "Open" then my openCodexUI()
end restartServices

on stopServices()
	display dialog "Stop host codexUI and Docker Tailscale?" with title "CodexUI Control" buttons {"Cancel", "Stop"} default button "Cancel" cancel button "Cancel"
	set remoteScript to "cd " & quoted form of repoDir & " && scripts/docker-tailscale-ios.sh down"
	set outputText to my runRemote(remoteScript, 90)
	display dialog outputText with title "CodexUI Stop" buttons {"OK"} default button "OK"
end stopServices

on runRemote(remoteScript, timeoutSeconds)
	with timeout of timeoutSeconds seconds
		return do shell script "ssh -o ServerAliveInterval=30 " & quoted form of sshTarget & " " & quoted form of remoteScript
	end timeout
end runRemote
