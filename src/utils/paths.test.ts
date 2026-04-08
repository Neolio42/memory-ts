// ============================================================================
// PATHS TESTS
// Tests for centralized path resolution utilities
// ============================================================================

import { describe, test, expect } from 'bun:test'
import {
  getCuratorPromptPath,
  getManagerPromptPath,
  getCentralStoragePath,
  getGlobalStoragePath,
  getGlobalMemoriesPath,
  getPersonalPrimerPath,
  getProjectStoragePath,
  getProjectMemoriesPath,
  getManagerCwd,
  resolveStoragePaths,
  getStorageMode,
  type StoragePaths,
} from './paths'
import { join } from 'path'
import { tmpdir, homedir } from 'os'

describe('temp paths', () => {
  test('getCuratorPromptPath should return path in tmpdir', () => {
    const path = getCuratorPromptPath()
    expect(path).toBe(join(tmpdir(), '.gemini-curator-prompt.md'))
    expect(path).toContain(tmpdir())
  })

  test('getManagerPromptPath should return path in tmpdir', () => {
    const path = getManagerPromptPath()
    expect(path).toBe(join(tmpdir(), '.gemini-manager-prompt.md'))
    expect(path).toContain(tmpdir())
  })
})

describe('storage paths', () => {
  test('getCentralStoragePath should return ~/.local/share/memory', () => {
    const path = getCentralStoragePath()
    expect(path).toBe(join(homedir(), '.local', 'share', 'memory'))
  })

  test('getGlobalStoragePath should return ~/.local/share/memory/global', () => {
    const path = getGlobalStoragePath()
    expect(path).toBe(join(getCentralStoragePath(), 'global'))
  })

  test('getGlobalMemoriesPath should return ~/.local/share/memory/global/memories', () => {
    const path = getGlobalMemoriesPath()
    expect(path).toBe(join(getGlobalStoragePath(), 'memories'))
  })

  test('getPersonalPrimerPath should return primer file path', () => {
    const path = getPersonalPrimerPath()
    expect(path).toBe(join(getGlobalStoragePath(), 'primer', 'personal-primer.md'))
  })
})

describe('project storage paths', () => {
  test('getProjectStoragePath in central mode', () => {
    const path = getProjectStoragePath('my-project-id')
    expect(path).toBe(join(getCentralStoragePath(), 'my-project-id'))
  })

  test('getProjectStoragePath in local mode', () => {
    const path = getProjectStoragePath('my-project-id', 'local', '/home/user/project')
    expect(path).toBe(join('/home/user/project', '.memory', 'my-project-id'))
  })

  test('getProjectStoragePath in local mode with custom folder', () => {
    const path = getProjectStoragePath('my-project-id', 'local', '/home/user/project', '.mem')
    expect(path).toBe(join('/home/user/project', '.mem', 'my-project-id'))
  })

  test('getProjectMemoriesPath in central mode', () => {
    const path = getProjectMemoriesPath('my-project-id')
    expect(path).toBe(join(getCentralStoragePath(), 'my-project-id', 'memories'))
  })

  test('getProjectMemoriesPath in local mode', () => {
    const path = getProjectMemoriesPath('my-project-id', 'local', '/home/user/project')
    expect(path).toBe(join('/home/user/project', '.memory', 'my-project-id', 'memories'))
  })
})

describe('resolveStoragePaths', () => {
  test('should resolve all paths in central mode', () => {
    const paths = resolveStoragePaths('test-project')
    expect(paths.projectPath).toBe(join(getCentralStoragePath(), 'test-project'))
    expect(paths.globalPath).toBe(getGlobalStoragePath())
    expect(paths.projectMemoriesPath).toBe(join(getCentralStoragePath(), 'test-project', 'memories'))
    expect(paths.globalMemoriesPath).toBe(getGlobalMemoriesPath())
    expect(paths.personalPrimerPath).toBe(getPersonalPrimerPath())
    expect(paths.storageMode).toBe('central')
  })

  test('should resolve all paths in local mode', () => {
    const paths = resolveStoragePaths('test-project', 'local', '/home/user/project')
    expect(paths.projectPath).toBe(join('/home/user/project', '.memory', 'test-project'))
    expect(paths.globalPath).toBe(getGlobalStoragePath()) // global is always central
    expect(paths.storageMode).toBe('local')
  })
})

describe('getStorageMode', () => {
  test('should default to central when no paths provided', () => {
    expect(getStorageMode()).toBe('central')
  })

  test('should return central when specified', () => {
    const paths: StoragePaths = {
      projectPath: '/test',
      globalPath: '/test/global',
      projectMemoriesPath: '/test/memories',
      globalMemoriesPath: '/test/global/memories',
      personalPrimerPath: '/test/global/primer/personal-primer.md',
      storageMode: 'central',
    }
    expect(getStorageMode(paths)).toBe('central')
  })

  test('should return local when specified', () => {
    const paths: StoragePaths = {
      projectPath: '/test',
      globalPath: '/test/global',
      projectMemoriesPath: '/test/memories',
      globalMemoriesPath: '/test/global/memories',
      personalPrimerPath: '/test/global/primer/personal-primer.md',
      storageMode: 'local',
    }
    expect(getStorageMode(paths)).toBe('local')
  })
})

describe('getManagerCwd', () => {
  test('should return central storage path in central mode', () => {
    const cwd = getManagerCwd()
    expect(cwd).toBe(getCentralStoragePath())
  })

  test('should return central storage path when storagePaths has central mode', () => {
    const paths: StoragePaths = {
      projectPath: '/test',
      globalPath: '/test/global',
      projectMemoriesPath: '/test/memories',
      globalMemoriesPath: '/test/global/memories',
      personalPrimerPath: '/test/global/primer/personal-primer.md',
      storageMode: 'central',
    }
    expect(getManagerCwd(paths)).toBe(getCentralStoragePath())
  })

  test('should return project path in local mode', () => {
    const paths: StoragePaths = {
      projectPath: '/local/project',
      globalPath: '/test/global',
      projectMemoriesPath: '/local/project/memories',
      globalMemoriesPath: '/test/global/memories',
      personalPrimerPath: '/test/global/primer/personal-primer.md',
      storageMode: 'local',
    }
    expect(getManagerCwd(paths)).toBe('/local/project')
  })
})
