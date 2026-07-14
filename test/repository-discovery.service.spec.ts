import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { RepositoryDiscoveryService } from '../src/services/repository-discovery.service';
import { TechnologyCatalogService } from '../src/services/technology-catalog.service';
import { WorkspaceConfigService } from '../src/services/config.service';
import { KitPathService } from '../src/services/kit-path.service';

describe('RepositoryDiscoveryService', () => {
  function createService(): RepositoryDiscoveryService {
    process.env.TCG_KIT_ROOT = resolve(__dirname, '..');
    const config = new WorkspaceConfigService();
    const catalog = new TechnologyCatalogService(new KitPathService());
    return new RepositoryDiscoveryService(catalog, config);
  }

  it('detects NestJS and Laravel inside an unstructured global folder', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-discovery-'));
    const workspace = join(base, 'workspace');
    const tech = join(base, 'Tech');
    const nest = join(tech, 'Backend', 'NestJS', 'nest');
    const laravel = join(tech, 'Backend', 'Laravel', '13');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(nest, '.git'), { recursive: true });
    mkdirSync(join(laravel, '.git'), { recursive: true });
    writeFileSync(join(nest, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    writeFileSync(join(nest, 'nest-cli.json'), '{}');
    writeFileSync(join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^13.0' } }));
    writeFileSync(join(laravel, 'artisan'), '#!/usr/bin/env php');

    const report = createService().discover(workspace, tech, { role: 'technology' });
    expect(report.candidates.map((item) => item.technology).sort()).toEqual(['laravel', 'nestjs']);
    expect(report.candidates.every((item) => item.category === 'backend')).toBe(true);
    expect(report.candidates.find((item) => item.technology === 'nestjs')?.key).toBe('nestjs');
    expect(report.candidates.find((item) => item.technology === 'laravel')?.key).toBe('laravel-13');
  });

  it('writes tech-context-graph.yaml only when apply is used', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-apply-'));
    const workspace = join(base, 'workspace');
    const project = join(base, 'Tech', 'Backend', 'NestJS', 'nest');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(project, { recursive: true });
    writeFileSync(join(workspace, 'tech-context-graph.yaml'), 'version: 4\nprojects: {}\n');
    writeFileSync(join(project, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    createService().discover(workspace, join(base, 'Tech'), { role: 'technology', apply: true });
    const config = parse(readFileSync(join(workspace, 'tech-context-graph.yaml'), 'utf8')) as any;
    expect(config.projects.nestjs.technology).toBe('nestjs');
    expect(config.projects.nestjs.graph_output).toBe('./tech-graphify-out/technologies/nestjs');
  });

  it('recognizes a framework source repository by its package name', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-framework-source-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'Backend', 'NestJS', 'nest');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({
      name: '@nestjs/core',
      dependencies: { rxjs: '^7.0.0' },
    }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('nestjs');
    expect(candidate?.technology_label).toBe('NestJS');
    expect(candidate?.markers).toContain('package-name:@nestjs/core');
  });

  it('recognizes the official Next.js monorepo instead of classifying it as generic React', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-next-source-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'FrontEnd', 'NextJS', 'next.js');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({
      name: 'nextjs-project',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('nextjs');
    expect(candidate?.technology_label).toBe('Next.js');
    expect(candidate?.markers).toContain('package-name:nextjs-project');
  });

  it('recognizes Vue core, Router and Pinia source repositories as one technology', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-vue-family-'));
    const workspace = join(base, 'workspace');
    const family = join(base, 'Tech', 'FrontEnd', 'Vue');
    const repositories = [
      { folder: 'core', pkg: { private: true, devDependencies: { '@vue/consolidate': '1.0.0' } } },
      { folder: 'router', pkg: { name: '@vue/router-root', private: true } },
      { folder: 'pinia', pkg: { name: '@pinia/root', private: true } },
    ];
    mkdirSync(workspace, { recursive: true });
    for (const repository of repositories) {
      const path = join(family, repository.folder);
      mkdirSync(join(path, '.git'), { recursive: true });
      writeFileSync(join(path, 'package.json'), JSON.stringify(repository.pkg));
    }

    const report = createService().discover(workspace, family, { role: 'technology' });

    expect(report.candidates).toHaveLength(3);
    expect(report.candidates.every((item) => item.technology === 'vue')).toBe(true);
    expect(report.candidates.map((item) => item.key).sort()).toEqual(['core', 'router', 'vue-pinia']);
  });

  it('nests the members of a composite technology under technologies/<tech>/<member>', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-vue-nesting-'));
    const workspace = join(base, 'workspace');
    const family = join(base, 'Tech', 'FrontEnd', 'Vue', 'Vue');
    const repositories = [
      { folder: 'core', pkg: { private: true, devDependencies: { '@vue/consolidate': '1.0.0' } } },
      { folder: 'router', pkg: { name: '@vue/router-root', private: true } },
      { folder: 'pinia', pkg: { name: '@pinia/root', private: true } },
    ];
    mkdirSync(workspace, { recursive: true });
    for (const repository of repositories) {
      const path = join(family, repository.folder);
      mkdirSync(join(path, '.git'), { recursive: true });
      writeFileSync(join(path, 'package.json'), JSON.stringify(repository.pkg));
    }

    const report = createService().discover(workspace, family, { role: 'technology' });

    expect(report.candidates.map((item) => item.graph_output).sort()).toEqual([
      './tech-graphify-out/technologies/vue/core',
      './tech-graphify-out/technologies/vue/router',
      './tech-graphify-out/technologies/vue/vue-pinia',
    ]);
    expect(report.candidates.every((item) => item.markers.includes('member_of:vue'))).toBe(true);
  });

  it('does not group a container whose subfolders are different technologies', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-heterogeneous-'));
    const workspace = join(base, 'workspace');
    const container = join(base, 'Tech', 'Mixed');
    const laravel = join(container, 'shop');
    const nest = join(container, 'api');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(laravel, '.git'), { recursive: true });
    mkdirSync(join(nest, '.git'), { recursive: true });
    writeFileSync(join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^13.0' } }));
    writeFileSync(join(laravel, 'artisan'), '#!/usr/bin/env php');
    writeFileSync(join(nest, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    writeFileSync(join(nest, 'nest-cli.json'), '{}');

    const report = createService().discover(workspace, container, { role: 'technology' });

    expect(report.candidates.map((item) => item.technology).sort()).toEqual(['laravel', 'nestjs']);
    expect(report.candidates.every((item) => !item.markers.some((marker) => marker.startsWith('member_of:')))).toBe(true);
    // Each stays a flat, independent top-level repository — never nested under a shared technology.
    expect(report.candidates.map((item) => item.graph_output).sort()).toEqual([
      './tech-graphify-out/technologies/laravel-shop',
      './tech-graphify-out/technologies/nestjs-api',
    ]);
  });

  it('recognizes the official PrimeVue monorepo and assigns its noise profile', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-primevue-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'PrimeVue', 'primevue');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@primevue/monorepo', private: true }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('primevue');
    expect(candidate?.technology_label).toBe('PrimeVue');
    expect(candidate?.ignore_profile).toBe('primevue');
  });
});
