property sshTarget : "uvxiao@115.27.161.184"
property repoDir : "/home/uvxiao/codexUI"
property directHostUrl : "http://115.27.161.184:5900"
property tailscaleUrl : "https://codexui-ios.tail27dc02.ts.net"

on run
	set actions to {"Open CodexUI", "Test Direct", "Restart Direct", "Restart With Tailscale", "Test Tailscale", "Stop All", "Open iOS URL"}
	set picked to choose from list actions with title "CodexUI Control" with prompt "Choose an action:" default items {"Open CodexUI"} OK button name "Run" cancel button name "Cancel"
	if picked is false then return
	set actionName to item 1 of picked
	
	if actionName is "Open CodexUI" then
		my openCodexUI()
	else if actionName is "Test Direct" then
		my testDirect()
	else if actionName is "Restart Direct" then
		my restartDirect()
	else if actionName is "Restart With Tailscale" then
		my restartWithTailscale()
	else if actionName is "Test Tailscale" then
		my testTailscale()
	else if actionName is "Stop All" then
		my stopAll()
	else if actionName is "Open iOS URL" then
		open location tailscaleUrl
	end if
end run

on openCodexUI()
	open location (my currentDirectUrl())
end openCodexUI

on currentDirectUrl()
	try
		set remoteScript to "cd " & quoted form of repoDir & " && NO_PROXY='*' no_proxy='*' scripts/codexui-deploy.sh status | sed -n 's/^Direct Mac\\/browser URL: //p' | tail -1"
		set outputText to my runRemote(remoteScript, 30)
		if outputText is not "" then return outputText
	end try
	return directHostUrl
end currentDirectUrl

on testDirect()
	set remoteScript to "cd " & quoted form of repoDir & " && NO_PROXY='*' no_proxy='*' scripts/codexui-deploy.sh status && printf '\\nDirect URL:\\n' && printf '%s\\n' " & quoted form of directHostUrl
	set outputText to my runRemote(remoteScript, 90)
	set dialogResult to display dialog outputText with title "CodexUI Direct Status" buttons {"Open", "OK"} default button "Open"
	if button returned of dialogResult is "Open" then my openCodexUI()
end testDirect

on restartDirect()
	set remoteScript to "cd " & quoted form of repoDir & " && NO_PROXY='*' no_proxy='*' CODEXUI_BUILD_ON_UP=0 scripts/codexui-deploy.sh up"
	set outputText to my runRemote(remoteScript, 180)
	set dialogResult to display dialog outputText with title "CodexUI Direct Restart" buttons {"Open", "OK"} default button "Open"
	if button returned of dialogResult is "Open" then my openCodexUI()
end restartDirect

on restartWithTailscale()
	set remoteScript to "cd " & quoted form of repoDir & " && NO_PROXY='*' no_proxy='*' CODEXUI_BUILD_ON_UP=0 scripts/docker-tailscale-ios.sh up"
	set outputText to my runRemote(remoteScript, 180)
	set dialogResult to display dialog outputText with title "CodexUI Tailscale Restart" buttons {"Open iOS URL", "Open Direct", "OK"} default button "Open iOS URL"
	if button returned of dialogResult is "Open iOS URL" then
		open location tailscaleUrl
	else if button returned of dialogResult is "Open Direct" then
		my openCodexUI()
	end if
end restartWithTailscale

on testTailscale()
	set remoteScript to "cd " & quoted form of repoDir & " && NO_PROXY='*' no_proxy='*' scripts/docker-tailscale-ios.sh status"
	set outputText to my runRemote(remoteScript, 90)
	set dialogResult to display dialog outputText with title "CodexUI Tailscale Status" buttons {"Open iOS URL", "OK"} default button "Open iOS URL"
	if button returned of dialogResult is "Open iOS URL" then open location tailscaleUrl
end testTailscale

on stopAll()
	display dialog "Stop host CodexUI and Docker Tailscale services?" with title "CodexUI Control" buttons {"Cancel", "Stop"} default button "Cancel" cancel button "Cancel"
	set remoteScript to "cd " & quoted form of repoDir & " && scripts/codexui-deploy.sh down"
	set outputText to my runRemote(remoteScript, 90)
	display dialog outputText with title "CodexUI Stop" buttons {"OK"} default button "OK"
end stopAll

on runRemote(remoteScript, timeoutSeconds)
	with timeout of timeoutSeconds seconds
		return do shell script "ssh -o ServerAliveInterval=30 " & quoted form of sshTarget & " " & quoted form of remoteScript
	end timeout
end runRemote
