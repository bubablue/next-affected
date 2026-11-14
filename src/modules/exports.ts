import * as fs from "fs";
import path from "path";
import ts from "typescript";
import { DependencyGraph } from "../types";
import { normalizePath } from "./utils";

interface ImportRecord {
  specifier: string;
  names: string[];
  wide: boolean;
}

interface ReExport {
  specifier: string;
  name: string;
}

interface ModuleInfo {
  imports: ImportRecord[];
  locals: Set<string>;
  reExports: Map<string, ReExport>;
  stars: string[];
  body: string;
}

const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["'`]([^"'`]+)["'`]\s*\)/g;
const REQUIRE_CALL = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

function scriptKindOf(file: string): ts.ScriptKind {
  if (/\.tsx$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(file)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

function declaredNames(name: ts.BindingName, names: string[] = []): string[] {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
  } else {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) declaredNames(element.name, names);
    }
  }
  return names;
}

export function parseModule(file: string, source: string): ModuleInfo {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, scriptKindOf(file));
  const info: ModuleInfo = {
    imports: [],
    locals: new Set(),
    reExports: new Map(),
    stars: [],
    body: sourceFile.statements
      .filter((statement) => !ts.isExportDeclaration(statement))
      .map((statement) => statement.getText(sourceFile))
      .join("\n"),
  };
  const importedBindings = new Map<string, ReExport>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) {
        info.imports.push({ specifier, names: [], wide: true });
        continue;
      }
      const names: string[] = [];
      let wide = false;
      if (clause.name) {
        names.push("default");
        importedBindings.set(clause.name.text, { specifier, name: "default" });
      }
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        wide = true;
        importedBindings.set(clause.namedBindings.name.text, { specifier, name: "*" });
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          names.push(imported);
          importedBindings.set(element.name.text, { specifier, name: imported });
        }
      }
      info.imports.push({ specifier, names, wide: wide || names.length === 0 });
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      info.imports.push({ specifier: statement.moduleReference.expression.text, names: [], wide: true });
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const specifier = statement.moduleSpecifier.text;
        if (!clause) {
          info.stars.push(specifier);
          info.imports.push({ specifier, names: [], wide: true });
        } else if (ts.isNamespaceExport(clause)) {
          info.reExports.set(clause.name.text, { specifier, name: "*" });
          info.imports.push({ specifier, names: [], wide: true });
        } else {
          const names: string[] = [];
          for (const element of clause.elements) {
            const original = (element.propertyName ?? element.name).text;
            info.reExports.set(element.name.text, { specifier, name: original });
            names.push(original);
          }
          info.imports.push({ specifier, names, wide: names.length === 0 });
        }
      } else if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const local = (element.propertyName ?? element.name).text;
          const binding = importedBindings.get(local);
          if (binding) {
            info.reExports.set(element.name.text, binding);
          } else {
            info.locals.add(element.name.text);
          }
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      info.locals.add("default");
    } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        info.locals.add("default");
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          declaredNames(declaration.name).forEach((name) => info.locals.add(name));
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement) ||
          ts.isModuleDeclaration(statement)) &&
        statement.name &&
        ts.isIdentifier(statement.name)
      ) {
        info.locals.add(statement.name.text);
      }
    }
  }

  for (const pattern of [DYNAMIC_IMPORT, REQUIRE_CALL]) {
    for (const match of source.matchAll(pattern)) {
      info.imports.push({ specifier: match[1], names: [], wide: true });
    }
  }

  return info;
}

function compilerOptionsOf(tsConfigPath: string | undefined): ts.CompilerOptions {
  const fallback: ts.CompilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  if (!tsConfigPath) return fallback;

  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
  if (configFile.error) return fallback;

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
  return { ...fallback, ...parsed.options, allowJs: true };
}

type ModuleUses = Record<string, string[]>;

export interface ReExportGraphs {
  traced: DependencyGraph;
  through: DependencyGraph;
  lookups: Record<string, ModuleUses>;
}

interface Recorder {
  lookup(file: string, name: string): void;
  through(file: string): void;
}

function createTracer(projectDir: string, tsConfigPath?: string) {
  const options = compilerOptionsOf(tsConfigPath);
  const moduleCache = new Map<string, ModuleInfo | null>();
  const resolutionCache = ts.createModuleResolutionCache(projectDir, (file) => file, options);
  const resolved = new Map<string, string | null>();

  const moduleOf = (file: string): ModuleInfo | null => {
    if (!moduleCache.has(file)) {
      let info: ModuleInfo | null;
      try {
        info = parseModule(file, fs.readFileSync(file, "utf-8"));
      } catch {
        info = null;
      }
      moduleCache.set(file, info);
    }
    return moduleCache.get(file) ?? null;
  };

  const resolve = (specifier: string, from: string): string | null => {
    const key = `${path.dirname(from)}\0${specifier}`;
    if (!resolved.has(key)) {
      const result = ts.resolveModuleName(specifier, from, options, ts.sys, resolutionCache);
      const target = result.resolvedModule;
      resolved.set(
        key,
        target && !target.isExternalLibraryImport ? normalizePath(target.resolvedFileName) : null
      );
    }
    return resolved.get(key) ?? null;
  };

  const closureOf = (file: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(file)) return seen;
    seen.add(file);
    const info = moduleOf(file);
    if (!info) return seen;
    const specifiers = [...info.stars, ...[...info.reExports.values()].map((reExport) => reExport.specifier)];
    for (const specifier of specifiers) {
      const target = resolve(specifier, file);
      if (target) closureOf(target, seen);
    }
    return seen;
  };

  const originsOf = (
    file: string,
    name: string,
    recorder: Recorder,
    seen = new Set<string>()
  ): string[] | null => {
    const key = `${file}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    recorder.lookup(file, name);

    const info = moduleOf(file);
    if (!info) return null;
    if (info.locals.has(name)) return [file];

    const reExport = info.reExports.get(name);
    if (reExport) {
      recorder.through(file);
      const target = resolve(reExport.specifier, file);
      if (!target) return [file];
      if (reExport.name === "*") {
        const closure = [...closureOf(target)];
        closure.forEach((member) => recorder.lookup(member, "*"));
        return closure;
      }
      return originsOf(target, reExport.name, recorder, seen) ?? [target];
    }

    for (const star of info.stars) {
      const target = resolve(star, file);
      const hit = target ? originsOf(target, name, recorder, seen) : null;
      if (hit) {
        recorder.through(file);
        return hit;
      }
    }
    return null;
  };

  const collectNames = (file: string, seen: Set<string>): Set<string> | null => {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const info = moduleOf(file);
    if (!info) return null;
    const names = new Set([...info.locals, ...info.reExports.keys()]);
    for (const star of info.stars) {
      const target = resolve(star, file);
      const starNames = target ? collectNames(target, seen) : null;
      if (!starNames) return null;
      starNames.forEach((name) => name !== "default" && names.add(name));
    }
    return names;
  };

  const namesCache = new Map<string, Set<string> | null>();
  const exportedNames = (file: string): Set<string> | null => {
    if (!namesCache.has(file)) namesCache.set(file, collectNames(file, new Set()));
    return namesCache.get(file) ?? null;
  };

  const wholeModule = (file: string, recorder: Recorder): string[] => {
    recorder.lookup(file, "*");
    const names = exportedNames(file);
    if (!names) {
      const closure = [...closureOf(file)];
      closure.forEach((member) => recorder.lookup(member, "*"));
      return closure;
    }
    const origins = new Set([file]);
    for (const name of names) {
      (originsOf(file, name, recorder) ?? [file]).forEach((origin) => origins.add(origin));
    }
    return [...origins];
  };

  const bindingsOf = (file: string, info: ModuleInfo, withStars: boolean): Map<string, string> | null => {
    const bindings = new Map<string, string>();
    for (const name of info.locals) bindings.set(name, `${file}\0${name}`);
    for (const [name, reExport] of info.reExports) {
      bindings.set(name, `${resolve(reExport.specifier, file) ?? reExport.specifier}\0${reExport.name}`);
    }
    if (!withStars) return bindings;
    for (const star of info.stars) {
      const target = resolve(star, file);
      const names = target ? exportedNames(target) : null;
      if (!names) return null;
      for (const name of names) {
        if (name !== "default" && !bindings.has(name)) bindings.set(name, `${target}\0${name}`);
      }
    }
    return bindings;
  };

  const changedNames = (file: string, previous: ModuleInfo, current: ModuleInfo): string[] | null => {
    if (previous.body !== current.body) return null;
    const sameStars = previous.stars.join("\0") === current.stars.join("\0");
    const before = bindingsOf(file, previous, !sameStars);
    const after = bindingsOf(file, current, !sameStars);
    if (!before || !after) return null;
    return [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => before.get(name) !== after.get(name))
      .sort();
  };

  return { moduleOf, resolve, originsOf, wholeModule, changedNames };
}

export function traceReExports(
  dependencyGraph: DependencyGraph,
  projectDir: string,
  tsConfigPath?: string
): ReExportGraphs {
  const tracer = createTracer(projectDir, tsConfigPath);
  const absolute = (id: string) => normalizePath(path.resolve(projectDir, id));
  const traced: DependencyGraph = {};
  const through: DependencyGraph = {};
  const lookups: Record<string, ModuleUses> = {};

  for (const [moduleId, dependencies] of Object.entries(dependencyGraph)) {
    const modulePath = absolute(moduleId);
    const known = new Set(dependencies.map(absolute));
    const info = tracer.moduleOf(modulePath);

    const targets = new Set<string>();
    const via = new Set<string>();
    const looked = new Map<string, Set<string>>();
    const handled = new Set<string>();
    const recorder: Recorder = {
      lookup: (file, name) => {
        const names = looked.get(file);
        if (names) names.add(name);
        else looked.set(file, new Set([name]));
      },
      through: (file) => via.add(file),
    };

    for (const record of info?.imports ?? []) {
      const target = tracer.resolve(record.specifier, modulePath);
      if (!target || !known.has(target)) continue;
      handled.add(target);

      if (record.wide) {
        tracer.wholeModule(target, recorder).forEach((file) => targets.add(file));
        continue;
      }
      for (const name of record.names) {
        (tracer.originsOf(target, name, recorder) ?? [target]).forEach((file) => targets.add(file));
      }
    }

    for (const dependency of known) {
      if (handled.has(dependency)) continue;
      targets.add(dependency);
      recorder.lookup(dependency, "*");
    }
    targets.delete(modulePath);
    via.delete(modulePath);
    looked.delete(modulePath);
    targets.forEach((file) => via.delete(file));
    traced[moduleId] = [...targets];
    through[moduleId] = [...via];
    lookups[moduleId] = Object.fromEntries([...looked].map(([file, names]) => [file, [...names]]));
  }

  return { traced, through, lookups };
}

export function changedExportNames(
  changedFiles: string[],
  readPrevious: (files: string[]) => Map<string, string | null>,
  projectDir: string,
  tsConfigPath?: string
): Map<string, string[]> {
  const tracer = createTracer(projectDir, tsConfigPath);
  const candidates = changedFiles
    .map((changedFile) => normalizePath(path.resolve(projectDir, changedFile)))
    .filter((file) => {
      const current = SOURCE_FILE.test(file) ? tracer.moduleOf(file) : null;
      return current !== null && (current.reExports.size > 0 || current.stars.length > 0);
    });
  const previousSources = candidates.length > 0 ? readPrevious(candidates) : new Map<string, string | null>();
  const changed = new Map<string, string[]>();

  for (const file of candidates) {
    const current = tracer.moduleOf(file);
    const previousSource = previousSources.get(file) ?? null;
    if (!current || previousSource === null) continue;
    const names = tracer.changedNames(file, parseModule(file, previousSource), current);
    if (names) changed.set(file, names);
  }

  return changed;
}
