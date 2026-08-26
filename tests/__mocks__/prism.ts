// Mock for @rlabs-inc/prism - Bun-dependent module
// Provides no-op implementations for all prism functions used by the logger

const identity = (s: string) => s

// Style proxy that returns identity functions for all style methods
const styleHandler: ProxyHandler<any> = {
  get(_target, prop) {
    if (prop === 'dim' || prop === 'bold' || prop === 'cyan' || prop === 'magenta' ||
        prop === 'yellow' || prop === 'red' || prop === 'green' || prop === 'blue') {
      return identity
    }
    return new Proxy(() => '', styleHandler)
  },
  apply(_target, _thisArg, args) {
    return args.join('')
  }
}

export const s = new Proxy({} as any, styleHandler)

export const log = {
  debug: (..._args: any[]) => {},
  info: (..._args: any[]) => {},
  success: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
}

export const box = (content: string) => content
export const table = (_data: any) => ''
export const badge = (text: string) => text
export const divider = () => '─'.repeat(60)
export const kv = (entries: [string, string][], _opts?: any) =>
  entries.map(([k, v]) => `  ${k}: ${v}`).join('\n')
export const writeln = (..._args: any[]) => {}
