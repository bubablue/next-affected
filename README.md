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
  - [Examples](#examples)
- [Configuration](#configuration)
  - [Default Configuration](#default-configuration)
  - [Configuration Options](#configuration-options)
  - [Customizing Configuration](#customizing-configuration)
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

You can install `next-affected` globally or as a dev dependency in your project.

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

#### `run [componentPath]`

List Next.js pages affected by changes.

```bash
next-affected run [componentPath] [options]
```

### Options

- `-p, --project <path>`: Path to the Next.js project. Defaults to `.` (current directory).
- `-b, --base <commit>`: Base commit or branch to compare changes. **Required when using `--only-uncommitted`**.
- `-h, --head <commit>`: Head commit or branch to compare changes. Defaults to `HEAD`.
- `-u, --uncommitted`: Include uncommitted changes in the analysis.
- `-o, --only-uncommitted`: Analyze only uncommitted changes against the base. **Requires `--base`**.
- `-d, --depth <number>`: Max depth for dependency traversal.
- `-v, --verbose`: Enable verbose logging.

### Examples

#### Analyze a Specific Component

Find all Next.js pages that are affected by changes in a specific component:

```bash
next-affected run src/components/Button.tsx
```

#### Include Uncommitted Changes

Analyze all changes including uncommitted (local) changes, listing the affected pages:

```bash
next-affected run --uncommitted --base main
```

#### Analyze Only Uncommitted Changes

Analyze only the uncommitted changes in your working directory against the `main` branch:

```bash
next-affected run --only-uncommitted --base main
```

> **Note:** The `--only-uncommitted` flag requires the `--base` (`-b`) flag to specify the base commit or branch.

#### Compare Changes Between Current Branch and `main`

Analyze all changes between your current branch and `main`, listing the affected pages:

```bash
next-affected run --base main
```

#### Compare Changes Between Two Commits

Replace `commit1` and `commit2` with actual commit hashes or branch names:

```bash
next-affected run --base commit1 --head commit2
```

#### Specify Project Directory and Verbose Logging

```bash
next-affected run --project /path/to/your/project --verbose
```

### Additional Help

For more detailed help and options, you can run:

```bash
next-affected run --help
```

## Configuration

`next-affected` uses a configuration file `next-affected.config.json` to customize its behavior.

### Default Configuration

```json
{
  "pagesDirectories": ["pages", "src/pages", "app", "src/app"],
  "excludedExtensions": [".css", ".scss", ".less", ".svg", ".png", ".jpg"]
}
```

### Configuration Options

- **`pagesDirectories`**: An array of directories where your Next.js pages are located. Customize this if your pages are in different directories.
- **`excludedExtensions`**: An array of file extensions to exclude from the dependency analysis. Add any extensions that you don't want to consider in the analysis.

### Customizing Configuration

You can edit the `next-affected.config.json` file to suit your project's structure:

```json
{
  "pagesDirectories": ["src/customPages"],
  "excludedExtensions": [".css", ".scss", ".less", ".svg", ".png", ".jpg", ".json"]
}
```

## How It Works

`next-affected` builds a dependency graph of your project and traverses it to find all pages that depend on a given component or have been affected by changes between Git commits or branches.

### Steps:

1. **Build Dependency Graph**: Uses [madge](https://github.com/pahen/madge) to build the dependency graph of your project.
2. **Determine Changed Files**: If using Git comparison mode (`--base`), it determines the list of changed files between the two commits or branches. If `--uncommitted` or `--only-uncommitted` is specified, it also includes uncommitted changes and untracked files.
3. **Traverse Dependencies**: For each changed file or specified component, it traverses the dependency graph to find all dependent modules, up to the specified depth.
4. **Identify Affected Pages**: Filters the dependent modules to identify which are Next.js pages based on the configured `pagesDirectories`.

## Troubleshooting

- **No Affected Pages Found**: Ensure that the paths in `pagesDirectories` are correct and point to your Next.js pages.
- **Errors Executing Git Command**: Verify that the commits or branches specified in `--base` and `--head` exist and are accessible.
- **Including Uncommitted Changes Not Working**: Make sure you have saved your changes and that they are within the project directory specified.
- **`--only-uncommitted` Flag Not Working**: Ensure you are also specifying the `--base` flag when using `--only-uncommitted`.
- **Verbose Logging**: Use the `--verbose` flag to enable detailed logging, which can help identify issues.

## License

This project is licensed under the [MIT License](LICENSE).

## Contribute

Feel free to open issues or contribute to the project!