import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// VM exports and lightweight native/React stubs are deliberately partial and heterogeneous.
// Keep their dynamic types at this test boundary; pure modules can request their real export type.
export type TestValue = any;
export type TestModule = Record<string, TestValue>;
export type TestNode = { type: TestValue; props: TestModule };
type Stub = string | number | boolean | null | undefined | Stub[] | Stubs | ((...args: TestValue[]) => TestValue);
export type Stubs = { [name: string]: Stub };

/** Load app code with explicit test doubles; unexpected imports never reach native APIs or the network. */
export function load<T = TestModule>(file: string, modules: Stubs = {}, globals: TestModule = {}): T {
  const source = readFileSync(resolve(import.meta.dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (!(name in modules)) throw new Error(`unexpected import: ${name}`);
    return modules[name];
  }, URL, URLSearchParams, Headers, TextDecoder, AbortController, console, ...globals, process: { env: {
    EXPO_PUBLIC_API_BASE_URL: 'https://api.test', EXPO_PUBLIC_SUPABASE_URL: 'https://db.test',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  } } });
  return exports as T;
}

/** Compare serialized values across the isolated VM realm. */
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const jsx = (type: TestValue, props: TestModule): TestNode => ({ type, props });
export const deferred = <T = void>() => Promise.withResolvers<T>();
