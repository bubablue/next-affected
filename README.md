# next-affected

[![npm version](https://img.shields.io/npm/v/next-affected)](https://www.npmjs.com/package/next-affected)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`next-affected` is a CLI tool that helps you identify which Next.js pages are affected by changes in your codebase. By analyzing your project's dependency graph, it determines which pages need to be rebuilt or retested, improving the efficiency of your development and CI/CD processes.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Initialize Configuration](#initialize-configuration)
  - [Commands](#commands)
  - [Options](#options)
  - [Output](#output)
  - [Examples](#examples)
- [Configuration](#configuration)
  - [Default Configuration](#default-configuration)
  - [Configuration Options](#configuration-options)
  - [Next.js conventions](#nextjs-conventions)
  - [Monorepos](#monorepos)
- [How It Works](#how-it-works)
  - [Steps](#steps)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Contribute](#contribute)

## Features

- **Analyze Specific Components**: Find out which Next.js pages are affected by changes in a specific component.
- **Git Integration**: Compare changes between Git commits or branches to identify affected pages.
- **Include Uncommitted Changes**: Optionally include uncommitted changes in your analysis.
- **Only Uncommitted Changes**: Analyze only uncommitted changes against a base commit or branch.
- **Customizable**: Supports custom configuration for page directories and file extensions to exclude.
- **TypeScript Support**: Works seamlessly with TypeScript and recognizes path aliases from `tsconfig.json`.
- **Verbose Logging**: Provides detailed logs for better debugging and analysis.

## Installation

You can install `next-affected` globally or as a dev dependency in your project. It requires Node.js 22.12 or later.

### Install Globally

```bash
npm install -g next-affected
```

### Install as a Dev Dependency

```bash
npm install --save-dev next-affected
```

## Usage

After installation, you can use `next-affected` directly from the command line.

### Initialize Configuration

First, initialize the configuration file in your project:

```bash
next-affected init
```

This command creates a `next-affected.config.json` file with default settings in your project's root directory.

### Commands

#### `init`

Initialize `next-affected` configuration.

```bash
next-affected init
```

#### `[componentPath]`

List Next.js pages affected by changes.

```bash
next-affected [componentPath] [options]
```

`next-affected run [componentPath] [options]` does the same, so existing scripts keep working. Options written after `run` belong to it.

### Options

- `--project <path>`: Path to the Next.js project. Defaults to `.` (current directory).
- `-b, --base <commit>`: Base commit or branch to compare changes. If it does not exist locally it is fetched from `origin`.
- `-h, --head <commit>`: Head commit or branch to compare changes. Defaults to `HEAD`.
- `-u, --uncommitted`: Compare the working tree (committed, staged, unstaged and untracked changes) with the merge base of `--base`. **Requires `--base`**.
- `-o, --only-uncommitted`: Analyze only staged, unstaged and untracked changes. Does not need `--base`.
- `-d, --depth <number>`: Max depth for dependency traversal (non-negative integer).
- `-f, --files`: Print the paths of the affected files. This is the default.
- `-p, --pages`: Print the URLs of the affected pages. Combine with `--files` to print both lists.
- `--json`: Print the affected pages as JSON (`route`, `file`, `pagesDirectory`).
- `-v, --verbose`: Enable verbose logging.

### Output

The affected route files are printed to stdout, one per line, relative to the project directory and sorted by path, so they can be pasted into a file search:

```text
Affected Files:
app/(shop)/cart/page.tsx
app/@modal/(.)cart/page.tsx
app/page.tsx
```

With `--pages`, the page URLs are printed instead, each starting with `/` and listed once even when several files serve them. `--files --pages` prints both lists.

```text
Affected Pages:
/
/cart
```

Progress and diagnostics go to stderr, so `$(next-affected ...)` captures only the result.

With the default conventions:

- App Router: `page` and `route` files, plus metadata files such as `sitemap` and `robots`, are routes. Route groups `(group)`, parallel slots `@slot` and private folders `_folder` are left out of the URL, and intercepting segments `(.)`, `(..)` and `(...)` resolve to the URL they intercept. A change that reaches a layout file (`layout`, `template`, `loading`, `error`, `not-found`, `default` and so on) marks every page below it. Route handlers are not wrapped by layouts, so they are not marked.
- Pages Router: every file is a route, `index` maps to its folder, and `_app` / `_document` mark every page except the ones under `api/`.
- Both routers: `middleware`, `proxy`, `instrumentation` and `next.config` in any folder above a pages directory mark every route of that directory, API routes included.
- Test files (`*.spec.*`, `*.test.*`, `__tests__/`) are never reported.
- With `--pages` and more than one pages directory, each URL is suffixed with its directory, for example `/[locale]/casino (apps/casino/app)`.

Every file name and pattern above comes from the configuration (see [Next.js conventions](#nextjs-conventions)), so a convention renamed in a future Next.js release only needs a config change.

Errors (missing pages directory, git failure, unreadable config) are printed to stderr with an `Error:` prefix and the command still exits `0`, so it never stops a pipeline. An invalid config value is reported and replaced by its default.

### Examples

#### Analyze a Specific Component

Find all Next.js pages that are affected by changes in a specific component:

```bash
next-affected src/components/Button.tsx
```

#### Include Uncommitted Changes

Analyze all changes including uncommitted (local) changes, listing the affected pages:

```bash
next-affected --uncommitted --base main
```

#### Analyze Only Uncommitted Changes

Analyze only the staged, unstaged and untracked changes in your working directory:

```bash
next-affected --only-uncommitted
```

#### Compare Changes Between Current Branch and `main`

Analyze all changes between your current branch and `main`, listing the affected pages:

```bash
next-affected --base main
```

#### Compare Changes Between Two Commits

Replace `commit1` and `commit2` with actual commit hashes or branch names:

```bash
next-affected --base commit1 --head commit2
```

#### Specify Project Directory and Verbose Logging

```bash
next-affected --project /path/to/your/project --verbose
```

### Additional Help

For more detailed help and options, you can run:

```bash
next-affected --help
```

## Configuration

`next-affected` reads `next-affected.config.json` from the project directory. Every key is optional; missing keys, including single keys inside `appRouter` and `pagesRouter`, use the defaults. Run `next-affected init` to write the full default file.

### Default Configuration

```json
{
  "pagesDirectories": [
    "pages",
    "src/pages",
    "app",
    "src/app"
  ],
  "excludedExtensions": [
    ".css",
    ".scss",
    ".less",
    ".svg",
    ".png",
    ".jpg"
  ],
  "excludedPaths": [],
  "pageExtensions": [
    "tsx",
    "ts",
    "jsx",
    "js"
  ],
  "testFiles": [
    "\\.(spec|test)\\.[jt]sx?$",
    "(^|/)__tests__/"
  ],
  "appWideFiles": [
    "middleware",
    "proxy",
    "instrumentation",
    "instrumentation-client",
    "next.config"
  ],
  "appRouter": {
    "directoryNames": [
      "app"
    ],
    "pageFiles": [
      "page"
    ],
    "handlerFiles": [
      "route"
    ],
    "layoutFiles": [
      "layout",
      "template",
      "default",
      "loading",
      "error",
      "global-error",
      "not-found",
      "forbidden",
      "unauthorized"
    ],
    "metadataFiles": {
      "sitemap": "sitemap.xml",
      "robots": "robots.txt",
      "manifest": "manifest.webmanifest",
      "icon": "icon",
      "apple-icon": "apple-icon",
      "opengraph-image": "opengraph-image",
      "twitter-image": "twitter-image"
    },
    "hiddenSegments": [
      "^\\(.+\\)$",
      "^@"
    ],
    "privateSegments": [
      "^_"
    ],
    "slotSegments": [
      "^@"
    ],
    "interceptionMarkers": {
      "(.)": 0,
      "(..)": 1,
      "(...)": "root"
    }
  },
  "pagesRouter": {
    "layoutFiles": [
      "_app",
      "_document"
    ],
    "handlerDirectories": [
      "api"
    ],
    "indexFiles": [
      "index"
    ]
  }
}
```

### Configuration Options

- **`pagesDirectories`**: Directories that contain routes. A directory whose name is listed in `appRouter.directoryNames` uses App Router rules; any other uses Pages Router rules. List only the apps you want reported.
- **`excludedExtensions`**: File extensions left out of the dependency analysis.
- **`excludedPaths`**: Directories (relative to the project) removed from the graph. Changes inside them are not traced to pages, which is useful for shared code whose changes would flag almost every page.
- **`pageExtensions`**: The same list as `pageExtensions` in `next.config`. Only files ending in one of these are routes, layouts or app-wide files.
- **`testFiles`**: Regular expressions matched against the path inside a pages directory. Matching files are never reported.
- **`appWideFiles`**: File names, without extension, that affect every route of the pages directories below them.

### Next.js conventions

**`appRouter`**

| Key | Meaning |
| --- | --- |
| `directoryNames` | Pages directory names that use App Router rules |
| `pageFiles` | Files that render a page; layouts wrap them |
| `handlerFiles` | Files that handle a route without a layout |
| `layoutFiles` | Files that wrap every page below their folder |
| `metadataFiles` | Metadata file names and the path each one is served at |
| `hiddenSegments` | Folder patterns left out of the URL |
| `privateSegments` | Folder patterns that are never routes |
| `slotSegments` | Parallel route slot patterns; a layout file at a slot root wraps the slot's parent |
| `interceptionMarkers` | Intercepting route prefixes and how many segments each goes up (`"root"` for the app root) |

**`pagesRouter`**

| Key | Meaning |
| --- | --- |
| `layoutFiles` | Files at the top of the pages directory that wrap every page |
| `handlerDirectories` | Folders whose routes are API handlers and are not wrapped |
| `indexFiles` | File names that map to their folder's URL |

For example, if a future release added `view` files next to `page` files, this is the only change needed:

```json
{
  "appRouter": { "pageFiles": ["page", "view"] }
}
```

### Monorepos

Run from the repository root and list the app directories you want reported. Shared code resolved through `tsconfig` `paths` is followed unless it is excluded:

```json
{
  "pagesDirectories": ["apps/shell/app"],
  "excludedPaths": ["packages"]
}
```

## How It Works

`next-affected` builds a dependency graph of your project and traverses it to find all pages that depend on a given component or have been affected by changes between Git commits or branches.

### Steps:

1. **Determine Changed Files**: If using Git comparison mode (`--base`), it determines the list of changed files between the two commits or branches. If `--uncommitted` or `--only-uncommitted` is specified, it also includes uncommitted changes and untracked files. Paths are resolved from the repository root, so `--project` can point at a subdirectory.
2. **Build Dependency Graph**: Uses [madge](https://github.com/pahen/madge) with the nearest `tsconfig.json`, `tsconfig.base.json` or `jsconfig.json`, starting from the pages directories and the app-wide files above them.
3. **Trace Re-exports**: Follows each named import through barrel files (an `index.ts` that re-exports other modules) to the file that declares it, using the TypeScript parser and the project's `tsconfig`. A page that imports `Mobile` from a barrel no longer depends on the barrel's other exports. `import *` and dynamic `import()` count every name the barrel exports. An import it cannot trace keeps madge's edge.
4. **Compare Changed Barrels**: In Git mode, a changed barrel file is compared, export by export, with its version before the change (the merge base, or `HEAD` with `--only-uncommitted`). Only modules that import an export that was added, removed or now resolves to a different file are marked. Replacing `export *` with the same names, or reordering lines, marks nothing. If anything other than export statements changed, or there is no previous version (a component path, a new file), every module that imports the barrel is marked. `--verbose` lists the exports that changed in each barrel.
5. **Traverse Dependencies**: Walks the reversed graph once, breadth-first, from all changed files together, up to the specified depth.
6. **Identify Affected Pages**: Maps the reached route files to URLs and expands reached layouts and app-wide files to the routes beneath them.

Re-export tracing assumes that importing a module has no side effects beyond its exports, the same assumption bundlers make when they tree-shake barrel files.

## Troubleshooting

- **No Affected Pages Found**: Ensure that the paths in `pagesDirectories` are correct and point to your Next.js pages.
- **Errors Executing Git Command**: Verify that the commits or branches specified in `--base` and `--head` exist and are accessible.
- **Including Uncommitted Changes Not Working**: Make sure you have saved your changes and that they are within the project directory specified.
- **`--uncommitted` Flag Not Working**: Ensure you are also specifying the `--base` flag when using `--uncommitted`.
- **Verbose Logging**: Use the `--verbose` flag to enable detailed logging, which can help identify issues.

## License

This project is licensed under the [MIT License](LICENSE).

## Contribute

Feel free to open issues or contribute to the project!