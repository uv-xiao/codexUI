import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { searchComposerPaths } from './composerFileSearch'

let tempDir = ''

afterEach(async () => {
  if (!tempDir) return
  await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('searchComposerPaths', () => {
  it('includes directories and symlinks alongside files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-composer-search-'))

    const realDir = join(tempDir, 'real')
    const nestedDir = join(realDir, 'nested')
    await mkdir(nestedDir, { recursive: true })
    await writeFile(join(realDir, 'alpha.txt'), 'alpha')
    await writeFile(join(nestedDir, 'beta.txt'), 'beta')
    await symlink(join(realDir, 'alpha.txt'), join(tempDir, 'file-link.txt'))
    await symlink(nestedDir, join(tempDir, 'dir-link'))

    const results = await searchComposerPaths(tempDir, '', 20)
    const byPath = new Map(results.map((entry) => [entry.path, entry]))

    expect(byPath.get('real/alpha.txt')?.kind).toBe('file')
    expect(byPath.get('real/alpha.txt')?.isSymlink).toBe(false)
    expect(byPath.get('file-link.txt')?.kind).toBe('file')
    expect(byPath.get('file-link.txt')?.isSymlink).toBe(true)
    expect(byPath.get('dir-link')?.kind).toBe('directory')
    expect(byPath.get('dir-link')?.isSymlink).toBe(true)
    expect(byPath.get('real/nested')?.kind).toBe('directory')
    expect(byPath.get('real/nested')?.isSymlink).toBe(false)
  })
})
