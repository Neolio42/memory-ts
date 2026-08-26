import { describe, it, expect } from 'bun:test'
import { c, symbols, box, fmt } from '../src/cli/colors'

describe('colors', () => {
  describe('c (style functions)', () => {
    it('c.bold wraps text with bold ANSI codes', () => {
      const result = c.bold('hello')
      expect(result).toContain('hello')
      expect(result).not.toBe('hello') // should have ANSI codes
    })

    it('c.dim wraps text', () => {
      const result = c.dim('hello')
      expect(result).toContain('hello')
    })

    it('c.red wraps text', () => {
      const result = c.red('error')
      expect(result).toContain('error')
    })

    it('c.green wraps text', () => {
      const result = c.green('success')
      expect(result).toContain('success')
    })

    it('c.yellow wraps text', () => {
      const result = c.yellow('warning')
      expect(result).toContain('warning')
    })

    it('c.blue wraps text', () => {
      const result = c.blue('info')
      expect(result).toContain('info')
    })

    it('c.magenta wraps text', () => {
      const result = c.magenta('brain')
      expect(result).toContain('brain')
    })

    it('c.cyan wraps text', () => {
      const result = c.cyan('highlight')
      expect(result).toContain('highlight')
    })

    it('c.white wraps text', () => {
      const result = c.white('plain')
      expect(result).toContain('plain')
    })

    it('c.gray wraps text', () => {
      const result = c.gray('muted')
      expect(result).toContain('muted')
    })

    it('semantic aliases work', () => {
      expect(c.success('ok')).toContain('ok')
      expect(c.error('fail')).toContain('fail')
      expect(c.warn('careful')).toContain('careful')
      expect(c.info('note')).toContain('note')
      expect(c.muted('dim')).toContain('dim')
    })

    it('combined styles work', () => {
      expect(c.header('title')).toContain('title')
      expect(c.highlight('important')).toContain('important')
      expect(c.command('run')).toContain('run')
    })

    it('handles empty string (returns ANSI escape sequence)', () => {
      // Node's styleText wraps even empty strings with ANSI codes
      expect(c.bold('').length).toBeGreaterThan(0)
    })

    it('handles special characters', () => {
      expect(c.red('hello 🧠 world')).toContain('hello 🧠 world')
    })
  })

  describe('symbols', () => {
    it('has expected symbols', () => {
      expect(symbols.tick).toBe('✓')
      expect(symbols.cross).toBe('✗')
      expect(symbols.warning).toBe('⚠')
      expect(symbols.info).toBe('ℹ')
      expect(symbols.bullet).toBe('•')
      expect(symbols.arrow).toBe('→')
      expect(symbols.brain).toBe('🧠')
      expect(symbols.sparkles).toBe('✨')
      expect(symbols.rocket).toBe('🚀')
      expect(symbols.gear).toBe('⚙️')
      expect(symbols.folder).toBe('📁')
      expect(symbols.file).toBe('📄')
      expect(symbols.clock).toBe('🕐')
    })

    it('all symbols are non-empty strings', () => {
      for (const [key, value] of Object.entries(symbols)) {
        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThan(0)
      }
    })
  })

  describe('box', () => {
    it('wrap creates a box around single-line text', () => {
      const result = box.wrap('hello')
      expect(result).toContain('hello')
      expect(result).toContain('┌')
      expect(result).toContain('┐')
      expect(result).toContain('└')
      expect(result).toContain('┘')
      expect(result).toContain('│')
      expect(result).toContain('─')
    })

    it('wrap handles multiline text', () => {
      const result = box.wrap('line1\nline2')
      expect(result).toContain('line1')
      expect(result).toContain('line2')
      const lines = result.split('\n')
      expect(lines.length).toBe(4) // top, line1, line2, bottom
    })

    it('wrap handles empty string', () => {
      const result = box.wrap('')
      expect(result).toContain('┌')
      expect(result).toContain('└')
    })

    it('wrap respects padding parameter', () => {
      const result1 = box.wrap('hi', 0)
      const result2 = box.wrap('hi', 2)
      // More padding = wider box
      const width1 = result1.split('\n')[0].length
      const width2 = result2.split('\n')[0].length
      expect(width2).toBeGreaterThan(width1)
    })
  })

  describe('fmt', () => {
    it('kv formats key-value pair', () => {
      const result = fmt.kv('name', 'value')
      expect(result).toContain('name')
      expect(result).toContain('value')
    })

    it('kv handles numbers', () => {
      const result = fmt.kv('count', 42)
      expect(result).toContain('42')
    })

    it('header formats header text', () => {
      const result = fmt.header('Test Header')
      expect(result).toContain('Test Header')
      expect(result).toContain('🧠')
    })

    it('section formats section with underline', () => {
      const result = fmt.section('Section Title')
      expect(result).toContain('Section Title')
    })

    it('item formats list item with bullet', () => {
      const result = fmt.item('List item')
      expect(result).toContain('List item')
      expect(result).toContain('•')
    })

    it('item respects indentation', () => {
      const result0 = fmt.item('item', 0)
      const result4 = fmt.item('item', 4)
      expect(result4.length).toBeGreaterThan(result0.length)
    })

    it('cmd formats command with prompt', () => {
      const result = fmt.cmd('npm install')
      expect(result).toContain('npm install')
      expect(result).toContain('$')
    })

    describe('bytes', () => {
      it('formats bytes', () => {
        expect(fmt.bytes(0)).toBe('0.0 B')
      })

      it('formats kilobytes', () => {
        expect(fmt.bytes(1024)).toBe('1.0 KB')
      })

      it('formats megabytes', () => {
        expect(fmt.bytes(1024 * 1024)).toBe('1.0 MB')
      })

      it('formats gigabytes', () => {
        expect(fmt.bytes(1024 * 1024 * 1024)).toBe('1.0 GB')
      })

      it('caps at GB', () => {
        const result = fmt.bytes(1024 * 1024 * 1024 * 1024) // 1 TB
        expect(result).toContain('GB')
      })

      it('formats partial sizes', () => {
        expect(fmt.bytes(1536)).toBe('1.5 KB')
      })
    })

    describe('duration', () => {
      it('formats milliseconds', () => {
        expect(fmt.duration(500)).toBe('500ms')
      })

      it('formats seconds', () => {
        expect(fmt.duration(1500)).toBe('1.5s')
      })

      it('formats minutes', () => {
        expect(fmt.duration(90000)).toBe('1.5m')
      })

      it('formats boundary: exactly 1000ms', () => {
        expect(fmt.duration(1000)).toBe('1.0s')
      })

      it('formats boundary: exactly 60000ms', () => {
        expect(fmt.duration(60000)).toBe('1.0m')
      })
    })

    describe('relativeTime', () => {
      it('returns "just now" for very recent timestamps', () => {
        expect(fmt.relativeTime(Date.now())).toBe('just now')
      })

      it('returns minutes ago', () => {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000
        expect(fmt.relativeTime(fiveMinAgo)).toBe('5m ago')
      })

      it('returns hours ago', () => {
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
        expect(fmt.relativeTime(twoHoursAgo)).toBe('2h ago')
      })

      it('returns days ago', () => {
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
        expect(fmt.relativeTime(threeDaysAgo)).toBe('3d ago')
      })

      it('prioritizes days over hours', () => {
        const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000
        expect(fmt.relativeTime(twentyFiveHoursAgo)).toBe('1d ago')
      })
    })
  })
})
