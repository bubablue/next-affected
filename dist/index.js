#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const madge_1 = __importDefault(require("madge"));
const path_1 = __importDefault(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const program = new commander_1.Command();
program
    .name("next-affected")
    .description("List Next.js pages affected by changes to a component")
    .version("1.0.0");
program
    .command("init")
    .description("Initialize next-affected configuration")
    .action(() => {
    initConfig();
});
program
    .command("run <componentPath>")
    .description("List Next.js pages affected by changes to a component")
    .option("-p, --project <path>", "Path to the Next.js project", ".")
    .option("-d, --depth <number>", "Max depth for dependency traversal", parseInt)
    .action(async (componentPath, options) => {
    await runNextAffected(componentPath, options);
});
program.parse(process.argv);
function initConfig() {
    const configFileName = "next-affected.config.json";
    const defaultConfig = {
        pagesDirectories: ["pages", "src/pages", "app", "src/app"],
        excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
    };
    if (fs.existsSync(configFileName)) {
        console.log(`${configFileName} already exists.`);
        return;
    }
    fs.writeFileSync(configFileName, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created ${configFileName} with default settings.`);
}
function loadConfig(projectDir) {
    const configFileName = "next-affected.config.json";
    const configFilePath = path_1.default.join(projectDir, configFileName);
    if (fs.existsSync(configFilePath)) {
        const configContent = fs.readFileSync(configFilePath, "utf-8");
        return JSON.parse(configContent);
    }
    else {
        // Default configuration
        return {
            pagesDirectories: ["pages", "src/pages", "app", "src/app"],
            excludedExtensions: [".css", ".scss", ".less", ".svg", ".png", ".jpg"],
        };
    }
}
async function runNextAffected(componentPath, options) {
    try {
        const projectDir = path_1.default.resolve(process.cwd(), options.project);
        const componentFullPath = path_1.default.resolve(process.cwd(), componentPath);
        const componentRelativePath = path_1.default.relative(projectDir, componentFullPath);
        const config = loadConfig(projectDir);
        const dependencyGraph = await getDependencyGraph(projectDir, config);
        const maxDepth = options.depth ?? Infinity;
        const affectedPages = findAffectedPages(dependencyGraph, componentRelativePath, maxDepth, projectDir, config);
        if (affectedPages.length > 0) {
            console.log("Affected Pages:");
            affectedPages.forEach((page) => console.log(page));
        }
        else {
            console.log("No affected pages found.");
        }
    }
    catch (error) {
        console.error("Error:", error.message);
        console.error(error);
    }
}
async function getDependencyGraph(projectDir, config) {
    const tsconfigPath = findTsConfig(projectDir);
    const tsconfigDir = path_1.default.dirname(tsconfigPath);
    const parsedConfig = readTsConfig(tsconfigPath);
    const aliases = getAliasesFromTsConfig(parsedConfig, tsconfigDir);
    const possibleEntryPoints = config.pagesDirectories.map((dir) => path_1.default.join(projectDir, dir));
    const entryPoints = getExistingEntryPoints(possibleEntryPoints);
    if (entryPoints.length === 0) {
        throw new Error(`No valid entry points found in ${projectDir}`);
    }
    const res = await (0, madge_1.default)(entryPoints, {
        baseDir: projectDir,
        fileExtensions: ["js", "jsx", "ts", "tsx"],
        includeNpm: false,
        tsConfig: tsconfigPath,
        webpackConfig: fs.existsSync(path_1.default.join(projectDir, "next.config.js"))
            ? path_1.default.join(projectDir, "next.config.js")
            : undefined,
        alias: aliases,
    });
    return res.obj();
}
function getExistingEntryPoints(entryPoints) {
    return entryPoints.filter((entryPoint) => fs.existsSync(entryPoint));
}
function findTsConfig(projectDir) {
    const possibleConfigs = ["tsconfig.json", "tsconfig.base.json"];
    let currentDir = projectDir;
    while (true) {
        for (const configName of possibleConfigs) {
            const tsconfigPath = path_1.default.join(currentDir, configName);
            if (fs.existsSync(tsconfigPath)) {
                return tsconfigPath;
            }
        }
        const parentDir = path_1.default.dirname(currentDir);
        if (parentDir === currentDir) {
            throw new Error("Could not find tsconfig.json or tsconfig.base.json");
        }
        currentDir = parentDir;
    }
}
function readTsConfig(tsconfigPath) {
    const configFile = typescript_1.default.readConfigFile(tsconfigPath, typescript_1.default.sys.readFile);
    if (configFile.error) {
        throw new Error(typescript_1.default.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    }
    const configParseResult = typescript_1.default.parseJsonConfigFileContent(configFile.config, typescript_1.default.sys, path_1.default.dirname(tsconfigPath));
    if (configParseResult.errors.length > 0) {
        const errorMessage = configParseResult.errors
            .map((error) => typescript_1.default.flattenDiagnosticMessageText(error.messageText, "\n"))
            .join("\n");
        throw new Error(errorMessage);
    }
    return configParseResult;
}
function getAliasesFromTsConfig(parsedConfig, tsconfigDir) {
    const aliases = {};
    if (parsedConfig.options.paths) {
        const paths = parsedConfig.options.paths;
        for (const aliasPattern in paths) {
            const aliasPaths = paths[aliasPattern];
            // Remove the trailing '/*' from the alias if present
            const aliasKey = aliasPattern.replace(/\/\*$/, "");
            // Assume the first path mapping is the primary one
            const targetPath = aliasPaths[0];
            // Remove the trailing '/*' and resolve the absolute path
            const targetDir = path_1.default.resolve(tsconfigDir, targetPath.replace(/\/\*$/, ""));
            aliases[aliasKey] = targetDir;
        }
    }
    return aliases;
}
function findAffectedPages(dependencyGraph, changedComponent, maxDepth = Infinity, projectDir, config) {
    const visited = new Set();
    const affectedPages = new Set();
    function traverse(module, depth) {
        if (visited.has(module) || depth > maxDepth)
            return;
        visited.add(module);
        module = normalizePath(path_1.default.resolve(projectDir, module));
        if (shouldExcludeModule(module, config)) {
            return;
        }
        const dependents = Object.keys(dependencyGraph).filter((key) => {
            const deps = dependencyGraph[key];
            if (!deps)
                return false;
            const normalizedDeps = deps.map((dep) => normalizePath(path_1.default.resolve(projectDir, dep)));
            return normalizedDeps.includes(module);
        });
        dependents.forEach((dependent) => {
            const normalizedDependent = normalizePath(path_1.default.resolve(projectDir, dependent));
            if (isPage(normalizedDependent, projectDir, config)) {
                const route = getRouteFromPage(normalizedDependent, projectDir, config);
                affectedPages.add(route);
            }
            else {
                traverse(dependent, depth + 1);
            }
        });
    }
    traverse(changedComponent, 0);
    return Array.from(affectedPages);
}
function isPage(modulePath, projectDir, config) {
    const normalizedPath = normalizePath(modulePath);
    const pagesDirs = config.pagesDirectories.map((dir) => normalizePath(path_1.default.join(projectDir, dir)));
    return pagesDirs.some((dir) => normalizedPath.startsWith(dir));
}
function getRouteFromPage(pagePath, projectDir, config) {
    const normalizedPagePath = normalizePath(pagePath);
    const pagesDirs = config.pagesDirectories.map((dir) => normalizePath(path_1.default.join(projectDir, dir)));
    let route = normalizedPagePath;
    for (const dir of pagesDirs) {
        if (normalizedPagePath.startsWith(dir)) {
            route = normalizedPagePath.slice(dir.length);
            break;
        }
    }
    route = route.replace(/\.(js|jsx|ts|tsx)$/, "");
    route = route.replace(/\/index$/, "") || "/";
    //   route = route.replace(/\[([^\]]+)\]/g, ":$1"); // Convert [param] to :param
    return route || "/";
}
function normalizePath(filePath) {
    const absolutePath = path_1.default.resolve(filePath);
    return absolutePath.replace(/\\/g, "/");
}
function shouldExcludeModule(modulePath, config) {
    return config.excludedExtensions.some((ext) => modulePath.endsWith(ext));
}
