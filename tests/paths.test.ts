import { describe, it, expect, beforeEach } from 'bun:test'
import {
  getCuratorPromptPath,
  getManagerPromptPath,
  getCentralStoragePath,
  getGlobalStoragePath,
  getGlobalMemoriesPath,
  getPersonalPrimerPath,
  getProjectStoragePath,
  getProjectMemoriesPath,
  getStorageMode,
  getManagerCwd,
  resolveStoragePaths,
  type StoragePaths,
} from '../src/utils/paths'
import { join } from 'path'
import { tmpdir, homedir } from 'os'

describe('paths', () => {
  describe('getCuratorPromptPath', () => {
    it('returns a path in tmpdir with .gemini-curator-prompt.md', () => {
      const path = getCuratorPromptPath()
      expect(path).toContain(tmpdir())
      expect(path).toContain('.gemini-curator-prompt.md')
    })
  })

  describe('getManagerPromptPath', () => {
    it('returns a path in tmpdir with .gemini-manager-prompt.md', () => {
      const path = getManagerPromptPath()
      expect(path).toContain(tmpdir())
      expect(path).toContain('.gemini-manager-prompt.md')
    })
  })

  describe('getCentralStoragePath', () => {
    it('returns ~/.local/share/memory', () => {
      const path = getCentralStoragePath()
      expect(path).toBe(join(homedir(), '.local', 'share', 'memory'))
    })
  })

  describe('getGlobalStoragePath', () => {
    it('returns ~/.local/share/memory/global', () => {
      const path = getGlobalStoragePath()
      expect(path).toBe(join(homedir(), '.local', 'share', 'memory', 'global'))
    })

    it('is a child of central storage path', () => {
      const path = getGlobalStoragePath()
      expect(path.startsWith(getCentralStoragePath())).toBe(true)
    })
  })

  describe('getGlobalMemoriesPath', () => {
    it('returns ~/.local/share/memory/global/memories', () => {
      const path = getGlobalMemoriesPath()
      expect(path).toBe(join(homedir(), '.local', 'share', 'memory', 'global', 'memories'))
    })
  })

  describe('getPersonalPrimerPath', () => {
    it('returns ~/.local/share/memory/global/primer/personal-primer.md', () => {
      const path = getPersonalPrimerPath()
      expect(path).toBe(join(homedir(), '.local', 'share', 'memory', 'global', 'primer', 'personal-primer.md'))
    })
  })

  describe('getProjectStoragePath', () => {
    it('returns central path for central mode', () => {
      const path = getProjectStoragePath('my-project')
      expect(path).toBe(join(getCentralStoragePath(), 'my-project'))
    })

    it('returns local path for local mode', () => {
      const path = getProjectStoragePath('my-project', 'local', '/home/user/code')
      expect(path).toBe('/home/user/code/.memory/my-project')
    })

    it('uses custom localFolder', () => {
      const path = getProjectStoragePath('my-project', 'local', '/home/user/code', '.mem')
      expect(path).toBe('/home/user/code/.mem/my-project')
    })

    it('falls back to central when local mode without projectPath', () => {
      const path = getProjectStoragePath('my-project', 'local')
      expect(path).toBe(join(getCentralStoragePath(), 'my-project'))
    })
  })

  describe('getProjectMemoriesPath', () => {
    it('returns central path + /memories', () => {
      const path = getProjectMemoriesPath('my-project')
      expect(path).toBe(join(getCentralStoragePath(), 'my-project', 'memories'))
    })

    it('returns local path + /memories', () => {
      const path = getProjectMemoriesPath('my-project', 'local', '/home/user/code')
      expect(path).toBe('/home/user/code/.memory/my-project/memories')
    })
  })

  describe('getStorageMode', () => {
    it('returns central by default', () => {
      expect(getStorageMode()).toBe('central')
    })

    it('returns central when undefined', () => {
      expect(getStorageMode(undefined)).toBe('central')
    })

    it('returns local when storagePaths has local mode', () => {
      const paths: StoragePaths = {
        projectPath: '/tmp/test',
        globalPath: '/tmp/global',
        projectMemoriesPath: '/tmp/test/memories',
        globalMemoriesPath: '/tmp/global/memories',
        personalPrimerPath: '/tmp/global/primer/personal-primer.md',
        storageMode: 'local',
      }
      expect(getStorageMode(paths)).toBe('local')
    })
  })

  describe('getManagerCwd', () => {
    it('returns central storage path for central mode', () => {
      expect(getManagerCwd()).toBe(getCentralStoragePath())
    })

    it('returns central storage path when no args', () => {
      expect(getManagerCwd(undefined)).toBe(getCentralStoragePath())
    })

    it('returns projectPath for local mode', () => {
      const paths: StoragePaths = {
        projectPath: '/tmp/my-project',
        globalPath: '/tmp/global',
        projectMemoriesPath: '/tmp/my-project/memories',
        globalMemoriesPath: '/tmp/global/memories',
        personalPrimerPath: '/tmp/global/primer/personal-primer.md',
        storageMode: 'local',
      }
      expect(getManagerCwd(paths)).toBe('/tmp/my-project')
    })

    it('returns empty string for local mode with empty projectPath (?? does not treat "" as nullish)', () => {
      const paths: StoragePaths = {
        projectPath: '',
        globalPath: '/tmp/global',
        projectMemoriesPath: '/tmp/memories',
        globalMemoriesPath: '/tmp/global/memories',
        personalPrimerPath: '/tmp/global/primer/personal-primer.md',
        storageMode: 'local',
      }
      // getManagerCwd uses storagePaths?.projectPath ?? getCentralStoragePath()
      // ?? only checks null/undefined, so empty string "" passes through as-is
      // NOTE: This may be a bug — local mode with empty projectPath probably
      // should fall back to central, but ?? won't do that for ""
      expect(getManagerCwd(paths)).toBe('')
    })
  })

  describe('resolveStoragePaths', () => {
    it('resolves central mode paths', () => {
      const paths = resolveStoragePaths('test-project')
      expect(paths.storageMode).toBe('central')
      expect(paths.projectPath).toBe(join(getCentralStoragePath(), 'test-project'))
      expect(paths.projectMemoriesPath).toBe(join(getCentralStoragePath(), 'test-project', 'memories'))
      expect(paths.globalPath).toBe(getGlobalStoragePath())
      expect(paths.globalMemoriesPath).toBe(getGlobalMemoriesPath())
      expect(paths.personalPrimerPath).toBe(getPersonalPrimerPath())
    })

    it('resolves local mode paths', () => {
      const paths = resolveStoragePaths('test-project', 'local', '/home/user/code')
      expect(paths.storageMode).toBe('local')
      expect(paths.projectPath).toBe('/home/user/code/.memory/test-project')
      expect(paths.projectMemoriesPath).toBe('/home/user/code/.memory/test-project/memories')
    })

    it('respects custom localFolder', () => {
      const paths = resolveStoragePaths('test-project', 'local', '/home/user/code', '.mem')
      expect(paths.projectPath).toBe('/home/user/code/.mem/test-project')
    })

    it('always uses central global paths regardless of mode', () => {
      const centralPaths = resolveStoragePaths('test-project', 'central')
      const localPaths = resolveStoragePaths('test-project', 'local', '/home/user/code')
      expect(localPaths.globalPath).toBe(centralPaths.globalPath)
      expect(localPaths.globalMemoriesPath).toBe(centralPaths.globalMemoriesPath)
      expect(localPaths.personalPrimerPath).toBe(centralPaths.personalPrimerPath)
    })
  })
})
