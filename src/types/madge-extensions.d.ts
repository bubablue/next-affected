import 'madge';

declare module 'madge' {
  interface MadgeConfig {
    /**
     * An object for resolving module aliases.
     */
    alias?: { [alias: string]: string };
  }
}
