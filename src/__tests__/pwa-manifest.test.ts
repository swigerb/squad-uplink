/**
 * PWA Configuration Tests
 *
 * Verifies vite-plugin-pwa configuration in vite.config.ts,
 * index.html PWA meta tags, and pwa.d.ts type declarations.
 *
 * Tests are spec-driven — they pass once Woz lands the VitePWA implementation.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Read vite.config.ts as raw text to verify PWA plugin configuration
const viteConfigPath = path.resolve(__dirname, '../../vite.config.ts');
const viteConfigRaw = fs.readFileSync(viteConfigPath, 'utf-8');

// Read index.html as raw text to verify meta tags
const indexHtmlPath = path.resolve(__dirname, '../../index.html');
const indexHtmlRaw = fs.readFileSync(indexHtmlPath, 'utf-8');

describe('PWA Configuration', () => {
  describe('vite.config.ts — VitePWA plugin', () => {
    it('imports VitePWA from vite-plugin-pwa', () => {
      expect(viteConfigRaw).toContain('vite-plugin-pwa');
    });

    it('uses autoUpdate register type', () => {
      expect(viteConfigRaw).toContain("registerType: 'autoUpdate'");
    });

    it('sets standalone display mode', () => {
      expect(viteConfigRaw).toContain("display: 'standalone'");
    });

    it('sets theme_color to black', () => {
      expect(viteConfigRaw).toContain("theme_color: '#000000'");
    });

    it('sets background_color to black', () => {
      expect(viteConfigRaw).toContain("background_color: '#000000'");
    });

    it('sets app name to Squad Uplink', () => {
      expect(viteConfigRaw).toContain("name: 'Squad Uplink'");
    });

    it('sets short_name to Uplink', () => {
      expect(viteConfigRaw).toContain("short_name: 'Uplink'");
    });

    it('includes 192x192 icon', () => {
      expect(viteConfigRaw).toContain('192x192');
    });

    it('includes 512x512 icon', () => {
      expect(viteConfigRaw).toContain('512x512');
    });

    it('includes maskable icon', () => {
      expect(viteConfigRaw).toContain('maskable');
    });
  });

  describe('index.html — PWA meta tags', () => {
    it('does NOT contain a manual manifest link (vite-plugin-pwa injects it)', () => {
      // vite-plugin-pwa auto-injects <link rel="manifest"> at build time,
      // so a manual one in index.html would cause duplicates
      expect(indexHtmlRaw).not.toMatch(/<link\s[^>]*rel=["']manifest["']/);
    });

    it('contains theme-color meta tag set to #000000', () => {
      expect(indexHtmlRaw).toContain('<meta name="theme-color" content="#000000"');
    });
  });

  describe('pwa.d.ts — type declarations', () => {
    it('pwa.d.ts file exists', () => {
      const pwaDtsPath = path.resolve(__dirname, '../pwa.d.ts');
      expect(fs.existsSync(pwaDtsPath)).toBe(true);
    });

    it('declares virtual:pwa-register module', () => {
      const pwaDtsPath = path.resolve(__dirname, '../pwa.d.ts');
      const content = fs.readFileSync(pwaDtsPath, 'utf-8');
      expect(content).toContain('virtual:pwa-register');
    });
  });
});
