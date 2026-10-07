import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import type { GlobalConfig, TokenCapConfig } from './types';

let cachedConfig: GlobalConfig | null = null;
let lastConfigMtime = 0;
let lastConfigPath = '';
let lastCheckTime = 0;

export function getConfigPath(): string {
  if (process.env.TOKENCAP_CONFIG_PATH) {
    return path.resolve(process.cwd(), process.env.TOKENCAP_CONFIG_PATH);
  }
  const yamlPath = path.join(process.cwd(), 'tokencap.yaml');
  if (fs.existsSync(yamlPath)) return yamlPath;
  return path.join(process.cwd(), 'tokencap.json');
}

function resolveEnvPlaceholders(content: string): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, varName) => process.env[varName] || '');
}

export function loadConfig(forceReload = false): GlobalConfig {
  const now = Date.now();
  if (!forceReload && cachedConfig && now - lastCheckTime < 1000) {
    return cachedConfig;
  }
  lastCheckTime = now;

  const targetPath = getConfigPath();
  const fileExists = fs.existsSync(targetPath);
  const isYaml = targetPath.endsWith('.yaml') || targetPath.endsWith('.yml');

  if (fileExists) {
    try {
      const stats = fs.statSync(targetPath);
      if (cachedConfig && targetPath === lastConfigPath && stats.mtimeMs === lastConfigMtime) {
        return cachedConfig;
      }
      let raw = fs.readFileSync(targetPath, 'utf8');
      raw = resolveEnvPlaceholders(raw);
      const parsed = (isYaml ? yaml.parse(raw) : JSON.parse(raw)) as GlobalConfig;
      if (parsed && typeof parsed === 'object' && parsed.keys) {
        cachedConfig = parsed;
        lastConfigMtime = stats.mtimeMs;
        lastConfigPath = targetPath;
        return cachedConfig;
      }
    } catch (err) {
      if (cachedConfig) {
        console.error('Warning: Failed to parse config file, keeping previous:', err);
        return cachedConfig;
      }
    }
  }

  const defaultConfig: GlobalConfig = {
    port: 8787,
    keys: {
      sk_virtual_example: {
        provider: 'openai',
        realKey: 'sk-proj-...',
        hardCapDaily: 2.0,
        hardCapMonthly: 20.0,
        rollingWindowCap: 0.5,
        rollingWindowSeconds: 3600,
      },
    },
  };

  try {
    fs.writeFileSync(targetPath, JSON.stringify(defaultConfig, null, 2));
    cachedConfig = defaultConfig;
    lastConfigPath = targetPath;
    lastConfigMtime = fs.statSync(targetPath).mtimeMs;
  } catch (_e) {
    cachedConfig = defaultConfig;
  }

  return cachedConfig;
}

export function getConfig(virtualKey: string): TokenCapConfig | null {
  if (!virtualKey || typeof virtualKey !== 'string') return null;
  const globalConfig = loadConfig();
  if (!globalConfig.keys || !Object.hasOwn(globalConfig.keys, virtualKey)) {
    return null;
  }
  return globalConfig.keys[virtualKey] || null;
}

export function saveKeyConfig(virtualKey: string, newConfig: TokenCapConfig): void {
  const current = loadConfig(true);
  current.keys = current.keys || {};
  current.keys[virtualKey] = newConfig;

  const targetPath = getConfigPath();
  fs.writeFileSync(targetPath, JSON.stringify(current, null, 2));
  loadConfig(true);
}
