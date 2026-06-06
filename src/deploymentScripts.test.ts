import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('deployment scripts', () => {
  it('keeps direct host deployment separate from the Tailscale wrapper', () => {
    const directScript = read('scripts/codexui-deploy.sh')
    const tailscaleScript = read('scripts/docker-tailscale-ios.sh')

    expect(directScript).toContain('ACTION="${1:-up}"')
    expect(directScript).toContain('up-tailscale)')
    expect(directScript).toContain('stop_tailscale')
    expect(directScript).toContain('print_direct_urls')
    expect(directScript).toContain('effective_host_port')
    expect(directScript).toContain('Requested port')
    expect(directScript).toContain('case "$ACTION" in')

    const defaultUpBlock = directScript.match(/\n  up\)([\s\S]*?)\n    ;;/)?.[1] ?? ''
    expect(defaultUpBlock).toContain('start_host_codexui')
    expect(defaultUpBlock).toContain('stop_tailscale')
    expect(defaultUpBlock).not.toContain('start_tailscale')
    expect(defaultUpBlock).not.toContain('serve_tailscale')

    expect(tailscaleScript).toContain('exec "$SCRIPT_DIR/codexui-deploy.sh" up-tailscale "$@"')
  })

  it('makes the Mac control app open the direct host URL without SSH forwarding by default', () => {
    const appleScript = read('scripts/macos-codexui-control.applescript')

    expect(appleScript).toContain('property directHostUrl : "http://115.27.161.184:5900"')
    expect(appleScript).toContain('"Restart Direct"')
    expect(appleScript).toContain('"Restart With Tailscale"')
    expect(appleScript).toContain('"Test Direct"')
    expect(appleScript).toContain('"Test Tailscale"')

    const openHandler = appleScript.match(/on openCodexUI\(\)([\s\S]*?)end openCodexUI/)?.[1] ?? ''
    expect(openHandler).toContain('my currentDirectUrl()')
    expect(openHandler).not.toContain('ensureTunnel')
    expect(appleScript).toContain('on currentDirectUrl()')
    expect(appleScript).toContain('scripts/codexui-deploy.sh status | sed')
    expect(appleScript).not.toContain('-L " & localPort')
  })
})
